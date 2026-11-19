import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import { hasSiteAccess } from "../services/search-console.js";
import { finishOperationEvent, startOperationEvent } from "../services/operation-events.js";
import { findContentGaps } from "../services/competitor-gap.js";
import { researchKeyword } from "../services/keyword-research.js";
import { getOpenAiKey } from "../services/api-keys.js";
import { loadProviderKeys } from "../services/provider-keys.js";
import { outlineToText, toPlanBrief } from "../services/plan-brief.js";
import { createProfileDatasets } from "../services/profile-datasets.js";
import { refreshSiteTopics } from "../services/topic-refresh.js";
import { postRepurpose, postTermCoverage } from "../services/post-tools.js";
import { getTopicalMap } from "../services/topical-map.js";
import { auditSite } from "../services/site-audit.js";
import { checkRankings, listRankings, planKeywordsForSite, trackKeywords, untrackKeyword } from "../services/rank-tracking.js";
import { checkAiVisibility, getAiVisibility } from "../services/ai-visibility.js";
import {
  addTopicsToPlan,
  analyzePostContent,
  applyProfileCta,
  discoverTopics,
  enableKnowledgeBase,
  fillPlan,
  generateProductProfile,
  getPlanItemBrief,
  getProductProfile,
  postStructuredData,
  saveProductProfile,
  siteLlmsTxt,
} from "../services/product-seo.js";

export const productSeoRoutes = new Hono();

async function tracked<T>(userId: string, siteId: string, action: string, run: () => Promise<T | null>) {
  const startedAt = Date.now();
  const eventId = await startOperationEvent({ userId, siteId, origin: "web", clientName: "BlogFactory web", action, objectType: "site" });
  try {
    const result = await run();
    await finishOperationEvent({ id: eventId, status: result ? "succeeded" : "failed", durationMs: Date.now() - startedAt, siteId, ...(result ? {} : { errorCode: "site_not_found" }) });
    return { result };
  } catch (error) {
    await finishOperationEvent({ id: eventId, status: "failed", durationMs: Date.now() - startedAt, siteId, errorCode: "generation_failed" });
    return { error: error instanceof Error ? error.message : "Request failed" };
  }
}

// Which optional providers can run right now. Booleans only: no key, login or account detail leaves the server.
productSeoRoutes.get("/capabilities", async (c) => {
  const userId = getUserId(c);
  const [openai, keys] = await Promise.all([getOpenAiKey(userId).then(Boolean).catch(() => false), loadProviderKeys(userId)]);
  return c.json({ serp: Boolean(keys.brave), volume: Boolean(keys.dataforseo), openai });
});

productSeoRoutes.get("/profile", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const data = await getProductProfile(userId, siteId);
  return data ? c.json(data) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/profile/generate", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "product_profile.generate", () => generateProductProfile(userId, siteId));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result, 201) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.put("/profile", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "product_profile.update", () => saveProductProfile(userId, siteId, body.profile));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/topics/discover", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "topics.discover", () => discoverTopics(userId, siteId));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/topics/plan", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const keywords = Array.isArray(body.keywords) ? body.keywords : [];
  if (!keywords.length) return c.json({ error: "Select at least one topic" }, 400);
  const { result, error } = await tracked(userId, siteId, "topics.plan", () => addTopicsToPlan(userId, siteId, keywords, body.briefs && typeof body.briefs === "object" ? body.briefs : {}));
  if (error) return c.json({ error }, 400);
  return result ? c.json({ items: result }, 201) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.get("/llms-txt", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const text = await siteLlmsTxt(userId, siteId);
  return text === null ? c.json({ error: "Site not found" }, 404) : c.json({ text });
});

productSeoRoutes.get("/posts/:id/analysis", async (c) => {
  const userId = getUserId(c);
  const analysis = await analyzePostContent(userId, c.req.param("id"), c.req.query("keyword") || undefined);
  return analysis ? c.json(analysis) : c.json({ error: "Post not found" }, 404);
});

productSeoRoutes.get("/posts/:id/json-ld", async (c) => {
  const userId = getUserId(c);
  const data = await postStructuredData(userId, c.req.param("id"));
  return data ? c.json(data) : c.json({ error: "Post not found" }, 404);
});

productSeoRoutes.post("/keyword-research", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "keyword.research", () => researchKeyword(userId, siteId, String(body.keyword || "")));
  if (error) return c.json({ error }, 400);
  return result ? c.json({ ...result, planBrief: toPlanBrief(result), serpConfigured: Boolean((await loadProviderKeys(userId)).brave) }) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/competitor-gaps", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "competitor.gaps", () => findContentGaps(userId, siteId, String(body.competitor || "")));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/topics/fill-plan", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "topics.fill_plan", () => fillPlan(userId, siteId, Number(body.limit) || 12));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result, 201) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.get("/plan-items/:id/brief", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const data = await getPlanItemBrief(userId, siteId, c.req.param("id"));
  if (!data) return c.json({ error: "Plan item not found" }, 404);
  return c.json({ brief: data.brief, outlineText: data.brief ? outlineToText(data.brief.outline) : "" });
});

productSeoRoutes.post("/knowledge/enable", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "knowledge.enable", () => enableKnowledgeBase(userId, siteId));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/cta/apply", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "product_cta.apply", () => applyProfileCta(userId, siteId));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/programmatic/datasets", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "programmatic.datasets", () => createProfileDatasets(userId, siteId));
  if (error) return c.json({ error }, 400);
  return result ? c.json({ datasets: result }, 201) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/topics/check", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const current = await getProductProfile(userId, siteId);
  const { result, error } = await tracked(userId, siteId, "topics.check", () => refreshSiteTopics(userId, siteId, current?.suggestions ?? null));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.get("/posts/:id/repurpose", async (c) => {
  const userId = getUserId(c);
  const data = await postRepurpose(userId, c.req.param("id"));
  return data ? c.json(data) : c.json({ error: "Post not found" }, 404);
});

productSeoRoutes.get("/posts/:id/term-coverage", async (c) => {
  const userId = getUserId(c);
  try {
    const data = await postTermCoverage(userId, c.req.param("id"), c.req.query("keyword") || undefined);
    return data ? c.json(data) : c.json({ error: "Post not found" }, 404);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Term comparison failed" }, 400);
  }
});

productSeoRoutes.get("/topical-map", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const map = await getTopicalMap(userId, siteId);
  return map ? c.json(map) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/audit", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "site.audit", () => auditSite(userId, siteId, body.fresh === true));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.get("/rankings", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const rankings = await listRankings(userId, siteId);
  return rankings ? c.json({ rankings, serpConfigured: Boolean((await loadProviderKeys(userId)).brave) }) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/rankings/track", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const keywords = body.fromPlan === true ? await planKeywordsForSite(userId, siteId) : body.keywords;
  const { result, error } = await tracked(userId, siteId, "rankings.track", () => trackKeywords(userId, siteId, keywords));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result, 201) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/rankings/untrack", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json({ removed: await untrackKeyword(userId, siteId, String(body.keyword || "")) });
});

productSeoRoutes.post("/rankings/check", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "rankings.check", () => checkRankings(userId, siteId));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.get("/ai-visibility", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const data = await getAiVisibility(userId, siteId);
  return data ? c.json(data) : c.json({ error: "Site not found" }, 404);
});

productSeoRoutes.post("/ai-visibility/check", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json().catch(() => ({}));
  const siteId = String(body.siteId || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const { result, error } = await tracked(userId, siteId, "ai_visibility.check", () => checkAiVisibility(userId, siteId, body.prompts));
  if (error) return c.json({ error }, 400);
  return result ? c.json(result) : c.json({ error: "Site not found" }, 404);
});
