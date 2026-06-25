import { Hono } from "hono";
import { drainCampaignQueue } from "../services/campaign-runner.js";
import { drainQueuedGoogleIndexing } from "../services/indexing.js";
import { processNextDeferredImage } from "../services/low-cost-images.js";

export const cronRoutes = new Hono();

export function isCronAuthorized(header: string | undefined, secret = process.env.CRON_SECRET) {
  return Boolean(secret) && header === `Bearer ${secret}`;
}

function positiveInt(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

cronRoutes.get("/drain", async (c) => {
  if (!isCronAuthorized(c.req.header("Authorization"))) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const task = c.req.query("task") || "all";
  const { runScheduler } = await import("../services/scheduler.js");
  const runFeeds = () => runScheduler(undefined, {
    awaitGeneration: true,
    maxFeeds: positiveInt(process.env.RSS_CRON_MAX_FEEDS, 1),
    maxPostsPerFeed: positiveInt(process.env.RSS_CRON_MAX_POSTS_PER_FEED, 1),
  });
  const runImages = async () => {
    const limit = positiveInt(process.env.IMAGE_CRON_MAX_REQUESTS, 2);
    const results = [];
    for (let index = 0; index < limit; index += 1) {
      const result = await processNextDeferredImage();
      results.push(result);
      if (!result.processed) break;
    }
    return results;
  };

  if (task === "feeds") return c.json({ ok: true, feeds: await runFeeds() });
  if (task === "campaigns") return c.json({ ok: true, campaigns: await drainCampaignQueue() });
  if (task === "indexing") return c.json({ ok: true, google: await drainQueuedGoogleIndexing() });
  if (task === "images") return c.json({ ok: true, images: await runImages() });

  const [campaigns, google, feeds, images] = await Promise.all([drainCampaignQueue(), drainQueuedGoogleIndexing(), runFeeds(), runImages()]);

  return c.json({ ok: true, campaigns, google, feeds, images });
});
