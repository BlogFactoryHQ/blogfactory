import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import { analyzeOptimizePage, listOptimizeAnalyses, listOptimizePages, markOptimized } from "../services/optimize.js";
import { hasSiteAccess } from "../services/search-console.js";

export const optimizeRoutes = new Hono();

optimizeRoutes.get("/pages", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  const status = String(c.req.query("status") || "all");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json({ pages: await listOptimizePages(userId, siteId, status) });
});

optimizeRoutes.get("/analyses", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json({ analyses: await listOptimizeAnalyses({
    userId,
    siteId,
    pageUrl: c.req.query("pageUrl") || c.req.query("page_url") || undefined,
    targetQuery: c.req.query("targetQuery") || c.req.query("target_query") || undefined,
  }) });
});

optimizeRoutes.post("/analyze", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);

  try {
    return c.json(await analyzeOptimizePage({
      userId,
      siteId,
      pageUrl: String(body.pageUrl || body.page_url || ""),
      targetQuery: String(body.targetQuery || body.target_query || ""),
      competitorUrls: Array.isArray(body.competitorUrls || body.competitor_urls)
        ? body.competitorUrls || body.competitor_urls
        : String(body.competitorUrls || body.competitor_urls || "").split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
    }), 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Analysis failed" }, 400);
  }
});

optimizeRoutes.post("/pages/:id/mark-optimized", async (c) => {
  const userId = getUserId(c);
  try {
    return c.json({ page: await markOptimized(userId, c.req.param("id")) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to mark optimized" }, 400);
  }
});
