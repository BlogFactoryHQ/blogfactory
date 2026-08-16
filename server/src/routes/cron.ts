import { Hono } from "hono";
import { waitUntil } from "@vercel/functions";
import { drainCampaignQueue } from "../services/campaign-runner.js";
import { drainQueuedGoogleIndexing } from "../services/indexing.js";
import { drainSearchConsoleSync } from "../services/search-console.js";
import { drainDeferredImages } from "../services/low-cost-images.js";
import { drainSeoMetadata, enqueueUntrackedDraftSeoMetadata } from "../services/seo-metadata.js";
import { safeError } from "../http/error-contract.js";

export const cronRoutes = new Hono();

export function isCronAuthorized(header: string | undefined, secret = process.env.CRON_SECRET) {
  return Boolean(secret) && header === `Bearer ${secret}`;
}

function positiveInt(value: unknown, fallback: number, max?: number) {
  const number = Number(value);
  const parsed = Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
  return max ? Math.min(parsed, max) : parsed;
}

function queryInt(
  query: (name: string) => string | undefined,
  names: string[],
  fallback: string | undefined,
  defaultValue: number,
  max: number,
) {
  for (const name of names) {
    const value = query(name);
    if (value) return positiveInt(value, defaultValue, max);
  }
  return positiveInt(fallback, defaultValue, max);
}

export function readCronDrainConfig(query: (name: string) => string | undefined, env: Record<string, string | undefined> = process.env) {
  return {
    feeds: {
      maxFeeds: queryInt(query, ["maxFeeds"], env.RSS_CRON_MAX_FEEDS, 1, 10),
      maxPostsPerFeed: queryInt(query, ["maxPostsPerFeed"], env.RSS_CRON_MAX_POSTS_PER_FEED, 1, 5),
    },
    campaigns: {
      maxCampaigns: queryInt(query, ["maxCampaigns"], undefined, 5, 10),
      maxItemsPerCampaign: queryInt(query, ["maxItemsPerCampaign"], undefined, 3, 10),
    },
    indexing: {
      limit: queryInt(query, ["indexingLimit", "limit"], undefined, 50, 100),
    },
    searchConsole: {
      limit: queryInt(query, ["searchConsoleLimit", "maxSites", "limit"], env.GSC_CRON_MAX_SITES, 10, 10),
    },
    seo: {
      limit: queryInt(query, ["seoLimit", "limit"], undefined, 5, 10),
      discoveryLimit: queryInt(query, ["seoDiscoveryLimit"], undefined, 100, 500),
    },
  };
}

cronRoutes.get("/drain", async (c) => {
  if (!isCronAuthorized(c.req.header("Authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const task = c.req.query("task") || "all";
  const workerUserId = c.req.query("userId");
  if ((task === "seo-worker" || task === "images-worker") && (!workerUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(workerUserId))) {
    return c.json({ error: "Invalid worker user" }, 400);
  }
  const config = readCronDrainConfig((name) => c.req.query(name));
  const { runScheduler } = await import("../services/scheduler.js");
  const runFeeds = () => runScheduler(undefined, {
    awaitGeneration: true,
    maxFeeds: config.feeds.maxFeeds,
    maxPostsPerFeed: config.feeds.maxPostsPerFeed,
  });
  const runImages = async () => {
    return drainDeferredImages();
  };
  const runSeo = async () => ({
    discovery: await enqueueUntrackedDraftSeoMetadata(config.seo.discoveryLimit),
    processed: await drainSeoMetadata(undefined, config.seo.limit),
  });

  if (task === "seo-worker") {
    waitUntil(drainSeoMetadata(workerUserId, 1)
      .then((results) => console.info("[seo] Background drain completed", { userId: workerUserId, processed: results.filter((result) => result.processed).length }))
      .catch((error) => console.error("[seo] Background drain failed", safeError(error))));
    return c.json({ ok: true, seo: { queued: true } }, 202);
  }
  if (task === "images-worker") {
    waitUntil(drainDeferredImages(workerUserId)
      .then((results) => console.info("[images] Background drain completed", { userId: workerUserId, processed: results.filter((result) => result.processed).length }))
      .catch((error) => console.error("[images] Background drain failed", safeError(error))));
    return c.json({ ok: true, images: { queued: true } }, 202);
  }

  if (task === "feeds") return c.json({ ok: true, feeds: await runFeeds() });
  if (task === "campaigns") {
    waitUntil(drainCampaignQueue(config.campaigns.maxCampaigns, config.campaigns.maxItemsPerCampaign).catch((err) => {
      console.error("[cron] Campaign drain failed", safeError(err));
    }));
    return c.json({ ok: true, campaigns: { queued: true } }, 202);
  }
  if (task === "indexing") return c.json({ ok: true, google: await drainQueuedGoogleIndexing(config.indexing.limit) });
  if (task === "search-console") return c.json({ ok: true, searchConsole: await drainSearchConsoleSync(config.searchConsole.limit) });
  if (task === "images") return c.json({ ok: true, images: await runImages() });
  if (task === "seo") return c.json({ ok: true, seo: await runSeo() });

  const [campaigns, google, searchConsole, feeds, images, seo] = await Promise.all([
    drainCampaignQueue(config.campaigns.maxCampaigns, config.campaigns.maxItemsPerCampaign),
    drainQueuedGoogleIndexing(config.indexing.limit),
    drainSearchConsoleSync(config.searchConsole.limit),
    runFeeds(),
    runImages(),
    runSeo(),
  ]);

  return c.json({ ok: true, campaigns, google, searchConsole, feeds, images, seo });
});
