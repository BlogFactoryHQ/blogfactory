import { Hono } from "hono";
import { waitUntil } from "@vercel/functions";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";
import { resolveOpenRouterTextModel } from "../services/openrouter-models.js";

export const contentRoutes = new Hono();

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
  const body = await c.req.json();

  try {
    const openRouterKey = await getOpenRouterKey(userId);
    if (!openRouterKey) return c.json({ error: "Add your OpenRouter API key in Settings before generating content" }, 400);
    const modelId = await resolveOpenRouterTextModel(openRouterKey, body.modelId || "openai/gpt-4o");

    const [job] = await db.insert(jobs).values({
      userId,
      sourceType: body.sourceType,
      sourceValue: body.sourceValue,
      modelId,
      personaId: body.personaId || null,
      status: "running",
      currentStep: "starting",
    }).returning();

    const { generateContent } = await import("../services/generate-content.js");
    waitUntil(generateContent({ ...body, userId, jobId: job.id, modelId }).catch(async (err) => {
      console.error("generate background error:", err);
      await db.update(jobs).set({
        status: "failed",
        errorMessage: err?.message || "Content generation failed",
        generationError: err?.message || "Content generation failed",
        completedAt: new Date(),
      }).where(eq(jobs.id, job.id));
    }));

    return c.json({ jobId: job.id, status: "running", postIds: [] }, 202);
  } catch (err: any) {
    console.error("generate error:", err);
    return c.json({ error: err.message || "Content generation failed" }, 500);
  }
});

contentRoutes.post("/article-plan", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();

  try {
    const { generateArticlePlan } = await import("../services/generate-content.js");
    const result = await generateArticlePlan({ ...body, userId });
    return c.json(result);
  } catch (err: any) {
    const message = err.message || "Article planning failed";
    if (message.includes("only supports") || message.includes("is required")) {
      return c.json({ error: message }, 400);
    }
    console.error("article plan error:", err);
    return c.json({ error: message }, 500);
  }
});

contentRoutes.post("/extract", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();

  try {
    const { extractContent } = await import("../services/extract-content.js");
    const result = await extractContent({ ...body, userId });
    return c.json(result);
  } catch (err: any) {
    console.error("extract error:", err);
    return c.json({ error: err.message || "Content extraction failed" }, 500);
  }
});

contentRoutes.post("/fetch-social", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();

  // Map frontend request shape to service interface
  const opts = {
    sourceUrl: fetchSocialSourceUrl(body),
    platform: body.platform,
    platformConfig: body.config || body.platformConfig,
    filterType: body.filterType,
    filterValue: body.filterValue,
    limit: body.limit,
    keywords: body.keywords,
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

    console.error("fetch-social error:", err);
    return c.json({ error: message || "Failed to fetch feed content.", items: [] }, 500);
  }
});

contentRoutes.post("/publish-wix", async (c) => {
  return c.json({
    error: "Use the per-site publishing integrations flow from /api/posts/:id/publish.",
  }, 410);
});
