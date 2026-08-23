import { Hono } from "hono";
import { waitUntil } from "@vercel/functions";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { campaignItems, campaigns, jobs } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";
import { claimFeedRun, normalizeFeedRunSlots, releaseFeedRun, type FeedRunClaim } from "../services/feed-run-lease.js";
import { resolveOpenRouterTextModel } from "../services/openrouter-models.js";
import { readJsonObject, requiredString, safeError } from "../http/error-contract.js";
import type { GenerateOpts } from "../services/generation-types.js";
import type { ExtractOpts } from "../services/extract-content.js";
import type { FetchOpts } from "../services/fetch-social-content.js";
import { SEO_PLAN_MODE } from "../services/seo-growth-plan.js";

export const contentRoutes = new Hono();

type GenerateRequestBody = Omit<GenerateOpts, "userId" | "jobId"> & {
  feed_id?: string;
  site_id?: string;
  preferred_integration_id?: string;
  feedRunToken?: string;
  feed_run_token?: string;
  feedRunSize?: number;
  feed_run_size?: number;
};

async function generationBody(c: Parameters<typeof readJsonObject>[0]) {
  const raw = await readJsonObject(c);
  return {
    ...raw,
    sourceType: requiredString(raw, "sourceType", ["source_type"]),
    sourceValue: requiredString(raw, "sourceValue", ["source_value"]),
  } as GenerateRequestBody;
}

export function fetchSocialSourceUrl(body: Record<string, any>) {
  if (body.sourceUrl) return body.sourceUrl;
  const config = body.config || body.platformConfig || {};
  if (body.platform === "youtube" && config.channelId) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${config.channelId}`;
  }
  if (body.platform === "reddit" && config.subreddit) {
    const domain = typeof config.redditDomain === "string" && config.redditDomain ? config.redditDomain : "www.reddit.com";
    return `https://${domain}/r/${String(config.subreddit).replace(/^r\//, "")}/`;
  }
  if (body.platform === "hackernews") return "https://news.ycombinator.com/";
  if (body.platform === "github") return "https://github.com/trending";
  return config.url || config.channelUrl || config.subredditUrl || "";
}

contentRoutes.post("/generate", async (c) => {
  const userId = getUserId(c);
  const body = await generationBody(c);
  let feedRunClaim: FeedRunClaim | null = null;
  let releaseScheduled = false;

  try {
    const campaignId = body.campaignId || null;
    const campaignItemId = body.campaignItemId || null;
    if (campaignId || campaignItemId) {
      if (!campaignId || !campaignItemId || !body.siteId) return c.json({ error: "Campaign, item, and site must be supplied together" }, 400);
      const [planItem] = await db.select({ id: campaignItems.id }).from(campaignItems).innerJoin(campaigns, eq(campaigns.id, campaignItems.campaignId)).where(and(
        eq(campaignItems.id, campaignItemId),
        eq(campaignItems.campaignId, campaignId),
        eq(campaignItems.userId, userId),
        eq(campaigns.userId, userId),
        eq(campaigns.siteId, body.siteId),
        eq(campaigns.mode, SEO_PLAN_MODE),
      )).limit(1);
      if (!planItem) return c.json({ error: "SEO plan item not found" }, 404);
    }
    const openRouterKey = await getOpenRouterKey(userId);
    if (!openRouterKey) return c.json({ error: "Add your OpenRouter API key in Settings before generating content" }, 400);
    const modelId = await resolveOpenRouterTextModel(openRouterKey, body.modelId || "openai/gpt-4o");
    const feedId = body.feedId || body.feed_id || null;
    const requestedFeedRunToken = body.feedRunToken || body.feed_run_token;
    if (requestedFeedRunToken && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestedFeedRunToken))) {
      return c.json({ error: "Invalid feed run token" }, 400);
    }
    if (feedId) {
      feedRunClaim = await claimFeedRun({
        feedId,
        userId,
        token: requestedFeedRunToken ? String(requestedFeedRunToken) : undefined,
        slots: normalizeFeedRunSlots(body.feedRunSize || body.feed_run_size),
      });
      if (!feedRunClaim) return c.json({ error: "Feed is already running" }, 409);
    }

    const [job] = await db.insert(jobs).values({
      userId,
      siteId: body.siteId || body.site_id || null,
      feedId,
      preferredIntegrationId: body.preferredIntegrationId || body.preferred_integration_id || null,
      sourceType: body.sourceType,
      sourceValue: body.sourceValue,
      modelId,
      personaId: body.personaId || null,
      campaignId,
      campaignItemId,
      status: "running",
      currentStep: "starting",
    }).returning();

    if (campaignItemId) {
      await db.update(campaignItems).set({ jobId: job.id, status: "running", planningStatus: "in_progress", startedAt: new Date() })
        .where(and(eq(campaignItems.id, campaignItemId), eq(campaignItems.userId, userId)));
    }

    const { generateContent } = await import("../services/generate-content.js");
    const generation = generateContent({ ...body, userId, jobId: job.id, modelId })
      .catch(async (err) => {
        console.error("generate background error", safeError(err));
        await db.update(jobs).set({
          status: "failed",
          errorMessage: err?.message || "Content generation failed",
          generationError: err?.message || "Content generation failed",
          completedAt: new Date(),
        }).where(eq(jobs.id, job.id));
      })
      .finally(async () => {
        if (!feedRunClaim || !feedId) return;
        await releaseFeedRun({ feedId, userId, token: feedRunClaim.token });
      });
    releaseScheduled = true;
    waitUntil(generation);

    return c.json({ jobId: job.id, status: "running", postIds: [] }, 202);
  } catch (err: any) {
    const feedId = body.feedId || body.feed_id || null;
    if (feedRunClaim && feedId && !releaseScheduled) {
      await releaseFeedRun({ feedId, userId, token: feedRunClaim.token }).catch((releaseError) => {
        console.error("feed run lease release error", safeError(releaseError));
      });
    }
    console.error("generate error", safeError(err));
    return c.json({ error: "Content generation failed" }, 500);
  }
});

contentRoutes.post("/article-plan", async (c) => {
  const userId = getUserId(c);
  const body = await generationBody(c);

  try {
    const { generateArticlePlan } = await import("../services/generate-content.js");
    const result = await generateArticlePlan({ ...body, userId });
    return c.json(result);
  } catch (err: any) {
    const message = err.message || "Article planning failed";
    if (message.includes("only supports") || message.includes("is required")) {
      return c.json({ error: message }, 400);
    }
    console.error("article plan error", safeError(err));
    return c.json({ error: "Article plan generation failed" }, 500);
  }
});

contentRoutes.post("/extract", async (c) => {
  const userId = getUserId(c);
  const rawBody = await readJsonObject(c);
  const body: Omit<ExtractOpts, "userId"> = {
    sourceType: requiredString(rawBody, "sourceType", ["source_type"]),
    sourceValue: requiredString(rawBody, "sourceValue", ["source_value"]),
    extractModel: typeof rawBody.extractModel === "string" ? rawBody.extractModel : undefined,
  };

  try {
    const { extractContent } = await import("../services/extract-content.js");
    const result = await extractContent({ ...body, userId });
    return c.json(result);
  } catch (err: any) {
    console.error("extract error", safeError(err));
    return c.json({ error: "Content extraction failed" }, 500);
  }
});

contentRoutes.post("/fetch-social", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);

  // Map frontend request shape to service interface
  const opts: FetchOpts = {
    sourceUrl: fetchSocialSourceUrl(body),
    platform: typeof body.platform === "string" ? body.platform : undefined,
    platformConfig: body.config || body.platformConfig,
    filterType: typeof body.filterType === "string" ? body.filterType : undefined,
    filterValue: typeof body.filterValue === "number" ? body.filterValue : undefined,
    limit: typeof body.limit === "number" ? body.limit : undefined,
    keywords: Array.isArray(body.keywords) ? body.keywords.filter((value): value is string => typeof value === "string") : undefined,
  };

  try {
    const { fetchSocialContent } = await import("../services/fetch-social-content.js");
    const result = await fetchSocialContent(opts);
    return c.json(result);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message.includes("Invalid URL") || message.includes("Only HTTP")) {
      return c.json({ error: "Invalid URL. Please provide a valid HTTP/HTTPS URL.", items: [] }, 400);
    }
    if (message.includes("private") || message.includes("internal")) {
      return c.json({ error: "Access to private/internal URLs is not allowed.", items: [] }, 400);
    }
    if (message.includes("Failed to fetch")) {
      return c.json({ error: "Could not reach the feed URL. Please check the URL and try again.", items: [] }, 502);
    }

    console.error("fetch-social error", safeError(err));
    return c.json({ error: "Failed to fetch feed content.", items: [] }, 500);
  }
});

contentRoutes.post("/publish-wix", async (c) => {
  return c.json({
    error: "Use the per-site publishing integrations flow from /api/posts/:id/publish.",
  }, 410);
});
