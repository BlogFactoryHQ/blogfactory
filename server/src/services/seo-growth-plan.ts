import { and, asc, desc, eq, inArray, isNull, max } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  campaignItems,
  campaigns,
  jobs,
  postPublications,
  posts,
  searchConsoleIntegrations,
  searchConsoleMetrics,
  sites,
} from "../db/schema.js";
import { listPageInsights, normalizePageUrlForSite, type PageInsight } from "./optimize.js";

export const SEO_PLAN_MODE = "seo_growth_plan";
export const SEO_ACTION_TYPES = ["new_content", "refresh", "snippet_test", "internal_link", "indexing_investigation"] as const;
export const SEO_PLANNING_STATUSES = ["planned", "in_progress", "completed", "blocked"] as const;

export type SeoActionType = typeof SEO_ACTION_TYPES[number];
export type SeoPlanningStatus = typeof SEO_PLANNING_STATUSES[number];

type Evidence = {
  opportunities?: string[];
  recommendation?: string;
  baseline_metrics?: { clicks: number; impressions: number; ctr: number; position: number };
  baseline_date?: string | null;
  captured_at?: string;
  source?: string;
};

export function seoActionType(opportunities: string[]): SeoActionType {
  if (opportunities.some((item) => ["needs_attention", "weak_focus", "wrong_page_risk"].includes(item))) return "refresh";
  if (opportunities.some((item) => ["low_ctr", "zero_clicks"].includes(item))) return "snippet_test";
  return "internal_link";
}

export function planDates(count: number, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + Math.min(index * 2, 29));
    return date.toISOString().slice(0, 10);
  });
}

export function validPlanDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function nextOpenPlanDate(occupied: Array<string | null>, now = new Date()) {
  const used = new Set(occupied.filter((value): value is string => Boolean(value)));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let offset = 0; offset < 30; offset += 1) {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + offset);
    const value = date.toISOString().slice(0, 10);
    if (!used.has(value)) return value;
  }
  return start.toISOString().slice(0, 10);
}

function comparableUrl(value: string) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "") || "/"}`;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function metricSummary(rows: Array<{ clicks: number; impressions: number; position: number }>) {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const position = impressions
    ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions
    : 0;
  return { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position: Number(position.toFixed(2)) };
}

function shiftIsoDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function ownedSite(userId: string, siteId: string) {
  const [site] = await db.select({ id: sites.id, name: sites.name, domain: sites.domain })
    .from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, userId))).limit(1);
  return site || null;
}

async function latestPlanCampaign(userId: string, siteId: string) {
  const [campaign] = await db.select().from(campaigns).where(and(
    eq(campaigns.userId, userId),
    eq(campaigns.siteId, siteId),
    eq(campaigns.mode, SEO_PLAN_MODE),
  )).orderBy(desc(campaigns.createdAt)).limit(1);
  return campaign || null;
}

async function gscFreshness(userId: string, siteId: string) {
  const [[metric], [integration]] = await Promise.all([
    db.select({ date: max(searchConsoleMetrics.date) }).from(searchConsoleMetrics).where(and(
      eq(searchConsoleMetrics.userId, userId), eq(searchConsoleMetrics.siteId, siteId),
    )),
    db.select({ lastSyncAt: searchConsoleIntegrations.lastSyncAt }).from(searchConsoleIntegrations).where(and(
      eq(searchConsoleIntegrations.userId, userId), eq(searchConsoleIntegrations.siteId, siteId),
    )).limit(1),
  ]);
  return { dataThrough: metric?.date || null, syncedAt: integration?.lastSyncAt?.toISOString() || null };
}

function evidenceForInsight(insight: PageInsight, freshness: Awaited<ReturnType<typeof gscFreshness>>, now: Date): Evidence {
  return {
    opportunities: insight.opportunities,
    recommendation: insight.suggestedAction,
    baseline_metrics: insight.latest,
    baseline_date: freshness.dataThrough,
    captured_at: now.toISOString(),
    source: "google_search_console",
  };
}

export async function generateSeoGrowthPlan(userId: string, siteId: string, now = new Date()) {
  const site = await ownedSite(userId, siteId);
  if (!site) return null;
  const [insights, freshness] = await Promise.all([listPageInsights(userId, siteId), gscFreshness(userId, siteId)]);
  if (!insights.length) throw new Error("Sync Search Console before generating a growth plan");

  let campaign = await latestPlanCampaign(userId, siteId);
  if (!campaign) {
    [campaign] = await db.insert(campaigns).values({
      userId,
      siteId,
      name: `${site.name} — 30-day SEO Growth Plan`,
      mode: SEO_PLAN_MODE,
      outlineMode: "none",
      status: "draft",
      modelId: "operator-controlled",
      settingsSnapshot: { source: "search_console", windowDays: 30 },
    }).returning();
  }

  const existing = await db.select().from(campaignItems).where(and(
    eq(campaignItems.campaignId, campaign.id), eq(campaignItems.userId, userId),
  ));
  const replaceable = existing.filter((item) => item.planningStatus === "planned" && !item.jobId && !item.postId && (item.evidence as Evidence | null)?.source === "google_search_console");
  if (replaceable.length) {
    await db.delete(campaignItems).where(and(
      eq(campaignItems.campaignId, campaign.id),
      eq(campaignItems.userId, userId),
      inArray(campaignItems.id, replaceable.map((item) => item.id)),
    ));
  }
  const preserved = existing.filter((item) => !replaceable.some((candidate) => candidate.id === item.id));
  const existingKeys = new Set(preserved.map((item) => `${item.actionType}\n${item.pageUrl}\n${item.keyword}`));
  const candidates = insights.slice(0, 12).filter((insight) => {
    const actionType = seoActionType(insight.opportunities);
    return !existingKeys.has(`${actionType}\n${insight.pageUrl}\n${insight.topQuery}`);
  });
  const dates = planDates(candidates.length, now);
  const nextPosition = preserved.reduce((highest, item) => Math.max(highest, item.position), 0) + 1;
  if (candidates.length) {
    await db.insert(campaignItems).values(candidates.map((insight, index) => ({
      campaignId: campaign.id,
      userId,
      position: nextPosition + index,
      input: insight.suggestedAction,
      keyword: insight.topQuery,
      title: insight.suggestedAction,
      actionType: seoActionType(insight.opportunities),
      pageUrl: insight.pageUrl,
      plannedFor: dates[index],
      evidence: evidenceForInsight(insight, freshness, now),
      planningStatus: "planned",
      status: "planned",
    })) as any);
  }
  await db.update(campaigns).set({ totalItems: preserved.length + candidates.length, updatedAt: now }).where(eq(campaigns.id, campaign.id));
  return getSeoGrowthPlan(userId, siteId, now);
}

export async function addSeoGrowthPlanItem(input: {
  userId: string;
  siteId: string;
  targetQuery: string;
  actionType: SeoActionType;
  pageUrl?: string | null;
  plannedFor?: string | null;
  title?: string | null;
}, now = new Date()) {
  const site = await ownedSite(input.userId, input.siteId);
  if (!site) return null;
  const targetQuery = input.targetQuery.trim();
  if (!targetQuery) throw new Error("Target query is required");
  if (!SEO_ACTION_TYPES.includes(input.actionType)) throw new Error("Unsupported SEO action type");
  const pageUrl = input.pageUrl?.trim() ? normalizePageUrlForSite(input.pageUrl, site.domain) : null;
  if (input.actionType !== "new_content" && !pageUrl) throw new Error("This action needs a page URL");
  let campaign = await latestPlanCampaign(input.userId, input.siteId);
  if (!campaign) {
    [campaign] = await db.insert(campaigns).values({
      userId: input.userId, siteId: input.siteId, name: `${site.name} — 30-day SEO Growth Plan`, mode: SEO_PLAN_MODE,
      outlineMode: "none", status: "draft", modelId: "operator-controlled", settingsSnapshot: { source: "manual", windowDays: 30 },
    }).returning();
  }
  const existing = await db.select({ position: campaignItems.position, plannedFor: campaignItems.plannedFor }).from(campaignItems)
    .where(and(eq(campaignItems.campaignId, campaign.id), eq(campaignItems.userId, input.userId)))
    .orderBy(desc(campaignItems.position));
  const plannedFor = input.plannedFor || nextOpenPlanDate(existing.map((item) => item.plannedFor), now);
  if (!validPlanDate(plannedFor)) throw new Error("Planned date must use YYYY-MM-DD");
  const maxPosition = existing[0]?.position || 0;
  const [duplicate] = await db.select().from(campaignItems).where(and(
    eq(campaignItems.campaignId, campaign.id),
    eq(campaignItems.userId, input.userId),
    eq(campaignItems.actionType, input.actionType),
    eq(campaignItems.keyword, targetQuery),
    pageUrl ? eq(campaignItems.pageUrl, pageUrl) : isNull(campaignItems.pageUrl),
  )).limit(1);
  if (duplicate) return duplicate;
  const [item] = await db.insert(campaignItems).values({
    campaignId: campaign.id,
    userId: input.userId,
    position: maxPosition + 1,
    input: input.title?.trim() || `Create work for ${targetQuery}`,
    keyword: targetQuery,
    title: input.title?.trim() || targetQuery,
    actionType: input.actionType,
    pageUrl,
    plannedFor,
    evidence: { source: "manual", captured_at: now.toISOString() },
    planningStatus: "planned",
    status: "planned",
  }).returning();
  await db.update(campaigns).set({ totalItems: existing.length + 1 }).where(eq(campaigns.id, campaign.id));
  return item;
}

export async function updateSeoGrowthPlanItem(input: {
  userId: string;
  siteId: string;
  itemId: string;
  plannedFor?: string;
  planningStatus?: SeoPlanningStatus;
}) {
  if (input.plannedFor !== undefined && !validPlanDate(input.plannedFor)) throw new Error("Planned date must use YYYY-MM-DD");
  if (input.planningStatus !== undefined && !SEO_PLANNING_STATUSES.includes(input.planningStatus)) throw new Error("Unsupported planning status");
  const [owned] = await db.select({ id: campaignItems.id }).from(campaignItems).innerJoin(campaigns, eq(campaigns.id, campaignItems.campaignId)).where(and(
    eq(campaignItems.id, input.itemId),
    eq(campaignItems.userId, input.userId),
    eq(campaigns.userId, input.userId),
    eq(campaigns.siteId, input.siteId),
    eq(campaigns.mode, SEO_PLAN_MODE),
  )).limit(1);
  if (!owned) return null;
  const [updated] = await db.update(campaignItems).set({
    ...(input.plannedFor !== undefined ? { plannedFor: input.plannedFor } : {}),
    ...(input.planningStatus !== undefined ? { planningStatus: input.planningStatus } : {}),
    updatedAt: new Date(),
  }).where(and(
    eq(campaignItems.id, input.itemId),
    eq(campaignItems.userId, input.userId),
  )).returning();
  return updated || null;
}

export async function getSeoGrowthPlan(userId: string, siteId: string, now = new Date()) {
  const site = await ownedSite(userId, siteId);
  if (!site) return null;
  const campaign = await latestPlanCampaign(userId, siteId);
  const freshness = await gscFreshness(userId, siteId);
  if (!campaign) return { campaign: null, items: [], summary: emptySummary(), freshness };
  const items = await db.select().from(campaignItems).where(and(
    eq(campaignItems.campaignId, campaign.id), eq(campaignItems.userId, userId),
  )).orderBy(asc(campaignItems.plannedFor), asc(campaignItems.position));
  const postIds = items.map((item) => item.postId).filter((id): id is string => Boolean(id));
  const jobIds = items.map((item) => item.jobId).filter((id): id is string => Boolean(id));
  const [postRows, jobRows, publicationRows] = await Promise.all([
    postIds.length ? db.select({ id: posts.id, editorialState: posts.editorialState, status: posts.status }).from(posts).where(and(eq(posts.userId, userId), eq(posts.siteId, siteId), inArray(posts.id, postIds))) : [],
    jobIds.length ? db.select({ id: jobs.id, status: jobs.status, errorMessage: jobs.errorMessage }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.siteId, siteId), inArray(jobs.id, jobIds))) : [],
    postIds.length ? db.select({ postId: postPublications.postId, publishMode: postPublications.publishMode, status: postPublications.status, externalUrl: postPublications.externalUrl }).from(postPublications).where(and(eq(postPublications.userId, userId), eq(postPublications.siteId, siteId), inArray(postPublications.postId, postIds))) : [],
  ]);
  const postById = new Map(postRows.map((row) => [row.id, row]));
  const jobById = new Map(jobRows.map((row) => [row.id, row]));
  const pubsByPost = new Map<string, typeof publicationRows>();
  for (const row of publicationRows) pubsByPost.set(row.postId, [...(pubsByPost.get(row.postId) || []), row]);
  const enriched = items.map((item) => {
    const post = item.postId ? postById.get(item.postId) : null;
    const job = item.jobId ? jobById.get(item.jobId) : null;
    const publications = item.postId ? pubsByPost.get(item.postId) || [] : [];
    return {
      ...item,
      stage: deriveStage(item.planningStatus, post?.editorialState, job?.status, publications),
      blocker: item.errorMessage || job?.errorMessage || null,
      publicationUrl: publications.find((row) => row.publishMode === "publish" && row.externalUrl)?.externalUrl || null,
    };
  });
  return { campaign, items: enriched, summary: summarizePlan(enriched), freshness, generatedAt: now.toISOString() };
}

function deriveStage(planningStatus: string | null, editorialState?: string, jobStatus?: string, publications: Array<{ status: string; publishMode: string }> = []) {
  if (planningStatus === "blocked" || jobStatus === "failed") return "blocked";
  if (publications.some((row) => row.publishMode === "draft" && row.status === "draft")) return "delivered";
  if (editorialState === "in_review" || editorialState === "approved" || editorialState === "changes_requested") return "review";
  if (jobStatus === "running" || jobStatus === "pending") return "drafting";
  if (planningStatus === "completed") return "measuring";
  if (editorialState || jobStatus === "completed") return "review";
  if (planningStatus === "in_progress") return "drafting";
  return "planned";
}

function emptySummary() {
  return { total: 0, planned: 0, drafting: 0, review: 0, delivered: 0, blocked: 0, measuring: 0 };
}

function summarizePlan(items: Array<{ stage: string }>) {
  return items.reduce((summary, item) => ({ ...summary, total: summary.total + 1, [item.stage]: summary[item.stage as keyof typeof summary] + 1 }), emptySummary());
}

export async function getSeoGrowthAttribution(userId: string, siteId: string) {
  const plan = await getSeoGrowthPlan(userId, siteId);
  if (!plan) return null;
  const measurable = plan.items.flatMap((item) => {
    const url = item.pageUrl || item.publicationUrl;
    const evidence = (item.evidence || {}) as Evidence;
    return url && evidence.baseline_date ? [{ item, url, evidence }] : [];
  });
  const rows = measurable.length ? await db.select().from(searchConsoleMetrics).where(and(
    eq(searchConsoleMetrics.userId, userId), eq(searchConsoleMetrics.siteId, siteId),
  )) : [];
  const cohort = measurable.map(({ item, url, evidence }) => {
    const matching = rows.filter((row) => comparableUrl(row.pageUrl) === comparableUrl(url));
    const baselineDate = evidence.baseline_date!;
    const baseline = evidence.baseline_metrics || { clicks: 0, impressions: 0, ctr: 0, position: 0 };
    const windows = [7, 14, 28].map((days) => {
      const endDate = shiftIsoDate(baselineDate, days);
      const baselineStart = shiftIsoDate(baselineDate, -days);
      const windowBaseline = metricSummary(matching.filter((row) => row.date > baselineStart && row.date <= baselineDate));
      const observed = metricSummary(matching.filter((row) => row.date > baselineDate && row.date <= endDate));
      const complete = Boolean(plan.freshness.dataThrough && plan.freshness.dataThrough >= endDate);
      return {
        days,
        endDate,
        status: complete ? "observed" : "pending",
        baseline: windowBaseline,
        metrics: observed,
        delta: complete ? {
          clicks: observed.clicks - windowBaseline.clicks,
          impressions: observed.impressions - windowBaseline.impressions,
          ctr: Number((observed.ctr - windowBaseline.ctr).toFixed(4)),
          position: Number((observed.position - windowBaseline.position).toFixed(2)),
        } : null,
      };
    });
    return { itemId: item.id, title: item.title, targetQuery: item.keyword, pageUrl: url, actionType: item.actionType, baselineDate, baseline, windows };
  });
  return {
    scope: "blogfactory_correlated_content",
    disclaimer: "Search Console movement is correlated with BlogFactory work and is not a causal attribution claim.",
    freshness: plan.freshness,
    cohort,
  };
}
