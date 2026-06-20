import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";

export const contentRoutes = new Hono();

contentRoutes.post("/generate", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();

  try {
    const { generateContent } = await import("../services/generate-content.js");
    const result = await generateContent({ ...body, userId });
    return c.json(result);
  } catch (err: any) {
    console.error("generate error:", err);
    return c.json({ error: err.message || "Content generation failed" }, 500);
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
    sourceUrl: body.sourceUrl || body.config?.url || body.config?.channelUrl || body.config?.subredditUrl || body.config?.instanceUrl || "",
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
  const userId = getUserId(c);
  const body = await c.req.json();

  const { publishToWix } = await import("../services/publish-to-wix.js");
  const result = await publishToWix({ ...body, userId });
  return c.json(result);
});
