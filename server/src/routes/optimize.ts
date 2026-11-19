import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import {
  analyzeOptimizePage,
  getOptimizeSummary,
  getPageInsightDetail,
  listOptimizeAnalyses,
  listOptimizePages,
  listPageInsights,
  markOptimized,
} from "../services/optimize.js";
import { hasSiteAccess } from "../services/search-console.js";
import {
  addSeoGrowthPlanItem,
  generateSeoGrowthPlan,
  getSeoGrowthAttribution,
  getSeoGrowthPlan,
  SEO_ACTION_TYPES,
  SEO_PLANNING_STATUSES,
  updateSeoGrowthPlanItem,
  type SeoActionType,
  type SeoPlanningStatus,
} from "../services/seo-growth-plan.js";
import { finishOperationEvent, startOperationEvent } from "../services/operation-events.js";

export const optimizeRoutes = new Hono();

optimizeRoutes.get("/growth-plan", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const plan = await getSeoGrowthPlan(userId, siteId);
  if (!plan) return c.json({ error: "Site not found" }, 404);
  return c.json(plan);
});

optimizeRoutes.get("/growth-plan/attribution", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const result = await getSeoGrowthAttribution(userId, siteId);
  if (!result) return c.json({ error: "Site not found" }, 404);
  return c.json(result);
});

optimizeRoutes.post("/growth-plan/generate", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const startedAt = Date.now();
  const eventId = await startOperationEvent({ userId, siteId, origin: "web", clientName: "BlogFactory web", action: "seo_plan.generate", objectType: "campaign" });
  try {
    const plan = await generateSeoGrowthPlan(userId, siteId);
    if (!plan) {
      await finishOperationEvent({ id: eventId, status: "failed", durationMs: Date.now() - startedAt, errorCode: "site_not_found" });
      return c.json({ error: "Site not found" }, 404);
    }
    await finishOperationEvent({ id: eventId, status: "succeeded", durationMs: Date.now() - startedAt, siteId });
    return c.json(plan, 201);
  } catch (error) {
    await finishOperationEvent({ id: eventId, status: "failed", durationMs: Date.now() - startedAt, siteId, errorCode: "generation_failed" });
    return c.json({ error: error instanceof Error ? error.message : "Plan generation failed" }, 400);
  }
});

optimizeRoutes.post("/growth-plan/items", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const startedAt = Date.now();
  const eventId = await startOperationEvent({ userId, siteId, origin: "web", clientName: "BlogFactory web", action: "seo_plan.add_item", objectType: "campaign_item" });
  try {
    const item = await addSeoGrowthPlanItem({
      userId,
      siteId,
      targetQuery: String(body.targetQuery || body.target_query || ""),
      actionType: String(body.actionType || body.action_type || "") as SeoActionType,
      pageUrl: body.pageUrl || body.page_url || null,
      plannedFor: body.plannedFor || body.planned_for || null,
      title: body.title || null,
    });
    if (!item) {
      await finishOperationEvent({ id: eventId, status: "failed", durationMs: Date.now() - startedAt, errorCode: "site_not_found" });
      return c.json({ error: "Site not found" }, 404);
    }
    await finishOperationEvent({ id: eventId, status: "succeeded", durationMs: Date.now() - startedAt, siteId });
    return c.json({ item }, 201);
  } catch (error) {
    await finishOperationEvent({ id: eventId, status: "failed", durationMs: Date.now() - startedAt, siteId, errorCode: "validation_error" });
    return c.json({ error: error instanceof Error ? error.message : "Could not add plan item", allowedActionTypes: SEO_ACTION_TYPES }, 400);
  }
});

optimizeRoutes.patch("/growth-plan/items/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const startedAt = Date.now();
  const eventId = await startOperationEvent({ userId, siteId, origin: "web", clientName: "BlogFactory web", action: "seo_plan.update_item", objectType: "campaign_item" });
  try {
    const item = await updateSeoGrowthPlanItem({
      userId,
      siteId,
      itemId: c.req.param("id"),
      plannedFor: body.plannedFor || body.planned_for,
      planningStatus: (body.planningStatus || body.planning_status) as SeoPlanningStatus | undefined,
    });
    if (!item) {
      await finishOperationEvent({ id: eventId, status: "failed", durationMs: Date.now() - startedAt, errorCode: "not_found" });
      return c.json({ error: "Plan item not found" }, 404);
    }
    await finishOperationEvent({ id: eventId, status: "succeeded", durationMs: Date.now() - startedAt, siteId });
    return c.json({ item });
  } catch (error) {
    await finishOperationEvent({ id: eventId, status: "failed", durationMs: Date.now() - startedAt, siteId, errorCode: "validation_error" });
    return c.json({ error: error instanceof Error ? error.message : "Could not update plan item", allowedStatuses: SEO_PLANNING_STATUSES }, 400);
  }
});

optimizeRoutes.get("/pages", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  const status = String(c.req.query("status") || "all");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json({ pages: await listOptimizePages(userId, siteId, status) });
});

optimizeRoutes.get("/summary", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json(await getOptimizeSummary(userId, siteId));
});

optimizeRoutes.get("/page-insights", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json({
    pages: await listPageInsights(userId, siteId, c.req.query("status") || "all", c.req.query("opportunity") || "all"),
  });
});

optimizeRoutes.get("/page-insights/:pageUrl", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json(await getPageInsightDetail(userId, siteId, decodeURIComponent(c.req.param("pageUrl"))));
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
