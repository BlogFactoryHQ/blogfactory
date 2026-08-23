import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { optimizeAnalyses, optimizePages, searchConsoleIntegrations, searchConsoleMetrics, sites } from "../db/schema.js";
import { extractContent } from "./extract-content.js";
import { getOpenRouterKey } from "./api-keys.js";
import { getEffectiveSettings } from "./user-settings.js";

export type OptimizeStatus = "needs_attention" | "tracking" | "improved";

interface MetricSummary {
  clicks: number;
  impressions: number;
  position: number;
}

interface ContentSnapshot {
  url: string;
  title?: string;
  wordCount: number;
  sectionCount: number;
  features: {
    faq: boolean;
    table: boolean;
    video: boolean;
    tableOfContents: boolean;
    images: number;
  };
  error?: string;
}

interface Suggestion {
  impact: "high" | "medium" | "low";
  title: string;
  detail: string;
}

interface ActionPlanItem {
  opportunity: string;
  title: string;
  detail: string;
}

type Opportunity =
  | "needs_attention"
  | "growing"
  | "almost_ranking"
  | "page_two"
  | "low_ctr"
  | "zero_clicks"
  | "weak_focus"
  | "wrong_page_risk";

interface GscMetric {
  date: string;
  pageUrl: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr?: number;
  position: number;
}

interface MetricDelta {
  clicks: number;
  impressions: number;
  position: number;
  ctr: number;
}

export interface PageInsight {
  pageUrl: string;
  topQuery: string;
  status: OptimizeStatus;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  baseline: MetricSummary & { ctr: number };
  latest: MetricSummary & { ctr: number };
  delta: MetricDelta;
  opportunities: Opportunity[];
  suggestedAction: string;
  topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
}

export function classifyOptimizeStatus(input: {
  baseline: MetricSummary;
  latest: MetricSummary;
  optimizedAt?: Date | string | null;
}): OptimizeStatus {
  const { baseline, latest, optimizedAt } = input;
  const enoughData = Math.max(baseline.impressions, latest.impressions) >= 50;
  const positionDelta = latest.position - baseline.position;
  const clickDrop = baseline.clicks > 0 ? (baseline.clicks - latest.clicks) / baseline.clicks : 0;
  const clickGain = baseline.clicks > 0 ? (latest.clicks - baseline.clicks) / baseline.clicks : latest.clicks > 0 ? 1 : 0;

  if (optimizedAt && enoughData && (positionDelta <= -3 || clickGain >= 0.2)) return "improved";
  if (enoughData && (positionDelta >= 5 || clickDrop >= 0.2)) return "needs_attention";
  return "tracking";
}

export function buildPageInsightsFromMetrics(metrics: GscMetric[]): PageInsight[] {
  if (!metrics.length) return [];
  const maxDate = metrics.reduce((max, metric) => metric.date > max ? metric.date : max, metrics[0].date);
  const latestStart = shiftDate(maxDate, -13);
  const baselineEnd = shiftDate(latestStart, -1);
  const baselineStart = shiftDate(baselineEnd, -13);
  const byPage = groupBy(metrics, (metric) => metric.pageUrl);
  const queryWinners = buildQueryWinners(metrics.filter((row) => row.date >= latestStart && row.date <= maxDate));

  return Array.from(byPage.entries())
    .map(([pageUrl, rows]) => {
      const latestRows = rows.filter((row) => row.date >= latestStart && row.date <= maxDate);
      const baselineRows = rows.filter((row) => row.date >= baselineStart && row.date <= baselineEnd);
      const latest = summarizeMetricsWithCtr(latestRows);
      const baseline = summarizeMetricsWithCtr(baselineRows);
      const topQueries = summarizeQueries(latestRows);
      const topQuery = topQueries[0]?.query || rows[0]?.query || "";
      const delta = {
        clicks: latest.clicks - baseline.clicks,
        impressions: latest.impressions - baseline.impressions,
        position: Number((latest.position - baseline.position).toFixed(2)),
        ctr: Number((latest.ctr - baseline.ctr).toFixed(4)),
      };
      const status = classifyOptimizeStatus({ baseline, latest });
      const opportunities = classifyOpportunities({ pageUrl, latest, baseline, topQueries, queryWinners });
      return {
        pageUrl,
        topQuery,
        status,
        clicks: latest.clicks,
        impressions: latest.impressions,
        ctr: latest.ctr,
        position: latest.position,
        baseline,
        latest,
        delta,
        opportunities,
        suggestedAction: suggestedAction(opportunities),
        topQueries: topQueries.slice(0, 5),
      };
    })
    .sort((a, b) => opportunityScore(b) - opportunityScore(a) || b.impressions - a.impressions);
}

export async function getOptimizeSummary(userId: string, siteId: string) {
  const [integration] = await db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.userId, userId), eq(searchConsoleIntegrations.siteId, siteId)))
    .limit(1);
  const metrics = await selectGscMetrics(userId, siteId);
  const insights = buildPageInsightsFromMetrics(metrics);
  const counts = opportunityCounts(insights);
  const queryCount = new Set(metrics.map((metric) => metric.query)).size;
  const topGrowingPage = insights.find((page) => page.opportunities.includes("growing")) || null;
  const biggestDecliningPage = insights.find((page) => page.status === "needs_attention") || null;
  const lowCtrPage = insights.find((page) => page.opportunities.includes("low_ctr")) || null;
  const bestQuickWin = insights.find((page) => page.opportunities.includes("almost_ranking") || page.opportunities.includes("low_ctr")) || null;
  const statusCounts = insights.reduce((items, page) => {
    items[page.status] = (items[page.status] || 0) + 1;
    return items;
  }, {} as Record<string, number>);
  return {
    lastSyncAt: integration?.lastSyncAt || null,
    last_sync_at: integration?.lastSyncAt || null,
    pageCount: insights.length,
    page_count: insights.length,
    queryCount,
    query_count: queryCount,
    clicks: insights.reduce((sum, page) => sum + page.clicks, 0),
    impressions: insights.reduce((sum, page) => sum + page.impressions, 0),
    needsAttentionCount: insights.filter((page) => page.status === "needs_attention").length,
    needs_attention_count: insights.filter((page) => page.status === "needs_attention").length,
    topGrowingPage,
    top_growing_page: topGrowingPage,
    biggestDecliningPage,
    biggest_declining_page: biggestDecliningPage,
    bestQuickWin,
    best_quick_win: bestQuickWin,
    lowCtrPage,
    low_ctr_page: lowCtrPage,
    opportunityCounts: counts,
    opportunity_counts: counts,
    statusCounts,
    status_counts: statusCounts,
  };
}

export async function listPageInsights(userId: string, siteId: string, status?: string, opportunity?: string) {
  let insights = buildPageInsightsFromMetrics(await selectGscMetrics(userId, siteId));
  if (status && status !== "all") insights = insights.filter((page) => page.status === status);
  if (opportunity && opportunity !== "all") insights = insights.filter((page) => page.opportunities.includes(opportunity as Opportunity));
  return insights.slice(0, 250);
}

export async function getPageInsightDetail(userId: string, siteId: string, pageUrl: string) {
  const normalizedPageUrl = normalizeHttpUrl(pageUrl);
  const metrics = (await selectGscMetrics(userId, siteId)).filter((metric) => normalizeHttpUrl(metric.pageUrl) === normalizedPageUrl);
  const [insight] = buildPageInsightsFromMetrics(metrics);
  const settings = await getEffectiveSettings(userId, siteId);
  const analyses = await listOptimizeAnalyses({ userId, siteId, pageUrl: normalizedPageUrl });
  const actions = await actionPlanForPage(userId, insight);
  const intent = queryIntentSummary(insight?.topQueries.map((query) => query.query) || metrics.map((metric) => metric.query));
  const daily = summarizeDaily(metrics);
  return {
    insight: insight || null,
    dailyHistory: daily,
    daily_history: daily,
    queries: summarizeQueries(metrics),
    queryIntentSummary: intent,
    query_intent_summary: intent,
    actionPlan: actions,
    action_plan: actions,
    analyses,
    internalLinkTargets: internalLinkTargets(settings?.internalLinkIndex, normalizedPageUrl),
    internal_link_targets: internalLinkTargets(settings?.internalLinkIndex, normalizedPageUrl),
  };
}

export function fallbackSuggestions(own: ContentSnapshot, competitors: ContentSnapshot[]): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const comparable = competitors.filter((item) => !item.error);
  const avgWords = comparable.length
    ? Math.round(comparable.reduce((sum, item) => sum + item.wordCount, 0) / comparable.length)
    : 0;
  const avgSections = comparable.length
    ? Math.round(comparable.reduce((sum, item) => sum + item.sectionCount, 0) / comparable.length)
    : 0;

  if (avgWords && own.wordCount < avgWords * 0.75) {
    suggestions.push({
      impact: "high",
      title: "Expand thin content",
      detail: `This page has ${own.wordCount} words; competitors average about ${avgWords}. Add depth to the sections that directly answer the query.`,
    });
  }
  if (avgSections && own.sectionCount < avgSections) {
    suggestions.push({
      impact: "medium",
      title: "Add missing sections",
      detail: `This page has ${own.sectionCount} sections; competitors average ${avgSections}. Split broad points into clearer subtopics.`,
    });
  }
  if (!own.features.faq && comparable.some((item) => item.features.faq)) {
    suggestions.push({
      impact: "high",
      title: "Add an FAQ section",
      detail: "At least one competitor uses FAQ-style coverage. Add concise answers for related search questions.",
    });
  }
  if (!own.features.table && comparable.some((item) => item.features.table)) {
    suggestions.push({
      impact: "medium",
      title: "Add a comparison table",
      detail: "Competitors use tables to make the answer easier to scan. Add one where users compare options, specs, or steps.",
    });
  }
  if (!own.features.tableOfContents && own.sectionCount >= 5) {
    suggestions.push({
      impact: "low",
      title: "Add a table of contents",
      detail: "A table of contents can help visitors jump between sections on longer pages.",
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      impact: "low",
      title: "Refresh examples and metadata",
      detail: "The page is broadly aligned. Update dated examples, title copy, and meta description before making bigger edits.",
    });
  }
  return suggestions.slice(0, 6);
}

export function normalizePageUrlForSite(pageUrl: string, siteDomain: string) {
  const normalized = normalizeHttpUrl(pageUrl);
  if (comparableHost(new URL(normalized).hostname) !== comparableHost(siteDomain)) {
    throw new Error(`URL does not belong to ${siteDomain}`);
  }
  return normalized;
}

export async function refreshOptimizePages(userId: string, siteId: string) {
  const metrics = await db
    .select()
    .from(searchConsoleMetrics)
    .where(and(eq(searchConsoleMetrics.userId, userId), eq(searchConsoleMetrics.siteId, siteId)));
  if (!metrics.length) return { updated: 0 };

  const maxDate = metrics.reduce((max, metric) => metric.date > max ? metric.date : max, metrics[0].date);
  const latestStart = shiftDate(maxDate, -13);
  const baselineEnd = shiftDate(latestStart, -1);
  const baselineStart = shiftDate(baselineEnd, -13);
  const groups = new Map<string, typeof metrics>();

  for (const metric of metrics) {
    const key = `${metric.pageUrl}\n${metric.query}`;
    const rows = groups.get(key);
    if (rows) rows.push(metric);
    else groups.set(key, [metric]);
  }

  const existingRows = await db
    .select({ pageUrl: optimizePages.pageUrl, targetQuery: optimizePages.targetQuery, optimizedAt: optimizePages.optimizedAt })
    .from(optimizePages)
    .where(and(eq(optimizePages.userId, userId), eq(optimizePages.siteId, siteId)));
  const existingByKey = new Map(existingRows.map((row) => [`${row.pageUrl}\n${row.targetQuery}`, row]));
  const updates: Array<typeof optimizePages.$inferInsert> = [];

  for (const [key, rows] of groups) {
    const [pageUrl, query] = key.split("\n");
    const baseline = summarizeMetrics(rows.filter((row) => row.date >= baselineStart && row.date <= baselineEnd));
    const latest = summarizeMetrics(rows.filter((row) => row.date >= latestStart && row.date <= maxDate));
    const status = classifyOptimizeStatus({ baseline, latest, optimizedAt: existingByKey.get(key)?.optimizedAt });
    updates.push({
      userId,
      siteId,
      pageUrl,
      targetQuery: query,
      status,
      baselineMetrics: baseline as never,
      latestMetrics: latest as never,
    });
  }

  for (const batch of chunkOptimizePageUpdates(updates)) {
    await db
      .insert(optimizePages)
      .values(batch)
      .onConflictDoUpdate({
        target: [optimizePages.siteId, optimizePages.pageUrl, optimizePages.targetQuery],
        set: {
          status: sql`excluded.status`,
          baselineMetrics: sql`excluded.baseline_metrics`,
          latestMetrics: sql`excluded.latest_metrics`,
          updatedAt: new Date(),
        },
      });
  }

  return { updated: updates.length };
}

export function chunkOptimizePageUpdates<T>(updates: T[], size = 500) {
  const batchSize = Math.max(1, Math.floor(size));
  const batches: T[][] = [];
  for (let index = 0; index < updates.length; index += batchSize) batches.push(updates.slice(index, index + batchSize));
  return batches;
}

export async function listOptimizePages(userId: string, siteId: string, status?: string) {
  const conditions = [eq(optimizePages.userId, userId), eq(optimizePages.siteId, siteId)];
  if (status && status !== "all") conditions.push(eq(optimizePages.status, status));
  const rows = await db
    .select()
    .from(optimizePages)
    .where(and(...conditions))
    .orderBy(desc(optimizePages.updatedAt))
    .limit(250);

  return rows.map(serializeOptimizePage);
}

export async function listOptimizeAnalyses(input: {
  userId: string;
  siteId: string;
  pageUrl?: string;
  targetQuery?: string;
}) {
  const conditions = [
    eq(optimizeAnalyses.userId, input.userId),
    eq(optimizeAnalyses.siteId, input.siteId),
  ];
  if (input.pageUrl) conditions.push(eq(optimizeAnalyses.pageUrl, normalizeHttpUrl(input.pageUrl)));
  if (input.targetQuery) conditions.push(eq(optimizeAnalyses.targetQuery, input.targetQuery.trim()));

  const rows = await db
    .select()
    .from(optimizeAnalyses)
    .where(and(...conditions))
    .orderBy(desc(optimizeAnalyses.createdAt))
    .limit(25);
  return rows.map(serializeOptimizeAnalysis);
}

export async function markOptimized(userId: string, id: string) {
  const [updated] = await db
    .update(optimizePages)
    .set({ optimizedAt: new Date(), status: "tracking" })
    .where(and(eq(optimizePages.id, id), eq(optimizePages.userId, userId)))
    .returning();
  if (!updated) throw new Error("Optimize page not found");
  return serializeOptimizePage(updated);
}

export async function analyzeOptimizePage(input: {
  userId: string;
  siteId: string;
  pageUrl: string;
  targetQuery: string;
  competitorUrls?: string[];
}) {
  const site = await getSite(input.userId, input.siteId);
  const pageUrl = normalizePageUrlForSite(input.pageUrl, site.domain);
  const targetQuery = input.targetQuery.trim();
  if (!targetQuery) throw new Error("Target query is required");

  const own = await snapshotPage(pageUrl);
  const competitorUrls = Array.from(new Set((input.competitorUrls || []).map((url) => url.trim()).filter(Boolean))).slice(0, 5);
  const competitors = [];
  for (const url of competitorUrls) {
    try {
      competitors.push(await snapshotPage(normalizeHttpUrl(url)));
    } catch (error) {
      competitors.push({ url, wordCount: 0, sectionCount: 0, features: emptyFeatures(), error: error instanceof Error ? error.message : "Failed to fetch page" });
    }
  }

  const suggestions = await aiSuggestions(input.userId, targetQuery, own, competitors) || fallbackSuggestions(own, competitors);

  const [page] = await db
    .insert(optimizePages)
    .values({
      userId: input.userId,
      siteId: input.siteId,
      pageUrl,
      targetQuery,
      status: "tracking",
      latestMetrics: null,
      baselineMetrics: null,
    })
    .onConflictDoUpdate({
      target: [optimizePages.siteId, optimizePages.pageUrl, optimizePages.targetQuery],
      set: { updatedAt: new Date() },
    })
    .returning();

  const [analysis] = await db
    .insert(optimizeAnalyses)
    .values({
      userId: input.userId,
      siteId: input.siteId,
      pageUrl,
      targetQuery,
      ownContentSnapshot: own as never,
      competitorSnapshots: competitors as never,
      suggestions: suggestions as never,
    })
    .returning();

  return { page: serializeOptimizePage(page), analysis: serializeOptimizeAnalysis(analysis) };
}

function serializeOptimizePage(row: typeof optimizePages.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    site_id: row.siteId,
    pageUrl: row.pageUrl,
    page_url: row.pageUrl,
    targetQuery: row.targetQuery,
    target_query: row.targetQuery,
    status: row.status,
    baselineMetrics: row.baselineMetrics,
    baseline_metrics: row.baselineMetrics,
    latestMetrics: row.latestMetrics,
    latest_metrics: row.latestMetrics,
    optimizedAt: row.optimizedAt,
    optimized_at: row.optimizedAt,
    createdAt: row.createdAt,
    created_at: row.createdAt,
    updatedAt: row.updatedAt,
    updated_at: row.updatedAt,
  };
}

function serializeOptimizeAnalysis(row: typeof optimizeAnalyses.$inferSelect) {
  return {
    id: row.id,
    siteId: row.siteId,
    site_id: row.siteId,
    pageUrl: row.pageUrl,
    page_url: row.pageUrl,
    targetQuery: row.targetQuery,
    target_query: row.targetQuery,
    ownContentSnapshot: row.ownContentSnapshot,
    own_content_snapshot: row.ownContentSnapshot,
    competitorSnapshots: row.competitorSnapshots,
    competitor_snapshots: row.competitorSnapshots,
    suggestions: row.suggestions,
    createdAt: row.createdAt,
    created_at: row.createdAt,
  };
}

function summarizeMetrics(rows: Array<{ clicks: number; impressions: number; position: number }>): MetricSummary {
  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  const position = impressions
    ? rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions
    : rows.length
      ? rows.reduce((sum, row) => sum + row.position, 0) / rows.length
      : 0;
  return { clicks, impressions, position: Number(position.toFixed(2)) };
}

function summarizeMetricsWithCtr(rows: Array<{ clicks: number; impressions: number; position: number }>) {
  const summary = summarizeMetrics(rows);
  return { ...summary, ctr: summary.impressions ? Number((summary.clicks / summary.impressions).toFixed(4)) : 0 };
}

function summarizeQueries(rows: GscMetric[]) {
  return Array.from(groupBy(rows, (row) => row.query).entries())
    .map(([query, queryRows]) => ({ query, ...summarizeMetricsWithCtr(queryRows) }))
    .sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);
}

function summarizeDaily(rows: GscMetric[]) {
  return Array.from(groupBy(rows, (row) => row.date).entries())
    .map(([date, dateRows]) => ({ date, ...summarizeMetricsWithCtr(dateRows) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function classifyOpportunities(input: {
  pageUrl: string;
  latest: MetricSummary & { ctr: number };
  baseline: MetricSummary & { ctr: number };
  topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  queryWinners: Map<string, { pageUrl: string; clicks: number; position: number }>;
}): Opportunity[] {
  const { pageUrl, latest, baseline, topQueries, queryWinners } = input;
  const opportunities: Opportunity[] = [];
  const enoughData = Math.max(latest.impressions, baseline.impressions) >= 50;
  const clickDrop = baseline.clicks > 0 ? (baseline.clicks - latest.clicks) / baseline.clicks : 0;
  const clickGain = baseline.clicks > 0 ? (latest.clicks - baseline.clicks) / baseline.clicks : latest.clicks > 0 ? 1 : 0;
  const positionDelta = latest.position - baseline.position;
  const topShare = latest.impressions ? (topQueries[0]?.impressions || 0) / latest.impressions : 0;

  if (enoughData && (positionDelta >= 5 || clickDrop >= 0.2)) opportunities.push("needs_attention");
  if (enoughData && (positionDelta <= -3 || clickGain >= 0.2)) opportunities.push("growing");
  if (latest.position >= 4 && latest.position <= 20) opportunities.push("almost_ranking");
  if (latest.position >= 11 && latest.position <= 20) opportunities.push("page_two");
  if (latest.impressions >= 100 && latest.ctr < expectedCtr(latest.position)) opportunities.push("low_ctr");
  if (latest.impressions >= 50 && latest.clicks === 0) opportunities.push("zero_clicks");
  if (topQueries.length >= 8 && topShare < 0.4) opportunities.push("weak_focus");
  if (topQueries.some((query) => {
    const winner = queryWinners.get(query.query);
    return winner && winner.pageUrl !== pageUrl && (winner.position + 1 < query.position || winner.clicks > query.clicks);
  })) opportunities.push("wrong_page_risk");

  return opportunities;
}

function suggestedAction(opportunities: Opportunity[]) {
  if (opportunities.includes("needs_attention")) return "Refresh declining content and update stale sections.";
  if (opportunities.includes("low_ctr")) return "Rewrite title and meta description for the top query.";
  if (opportunities.includes("almost_ranking") || opportunities.includes("page_two")) return "Expand the matching section and add internal links.";
  if (opportunities.includes("weak_focus")) return "Tighten the page around one primary intent.";
  if (opportunities.includes("zero_clicks")) return "Improve the snippet or reassess search intent.";
  if (opportunities.includes("growing")) return "Monitor gains and reinforce with internal links.";
  return "Keep tracking performance.";
}

async function actionPlanForPage(userId: string, insight?: PageInsight): Promise<ActionPlanItem[]> {
  const fallback = actionPlan(insight?.opportunities || []);
  if (!insight?.opportunities.length) return fallback;
  const enhanced = await aiActionPlan(userId, insight, fallback);
  return enhanced || fallback;
}

function actionPlan(opportunities: Opportunity[]): ActionPlanItem[] {
  const items = opportunities.map((opportunity) => ({
    opportunity,
    title: suggestedAction([opportunity]),
    detail: actionDetail(opportunity),
  }));
  return items.length ? items : [{ opportunity: "tracking", title: "Keep tracking performance.", detail: "No urgent GSC opportunity is flagged for this page." }];
}

async function aiActionPlan(userId: string, insight: PageInsight, fallback: ActionPlanItem[]) {
  const key = await getOpenRouterKey(userId);
  if (!key) return null;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      messages: [{
        role: "user",
        content: `Return JSON only: {"actionPlan":[{"opportunity":"...","title":"...","detail":"..."}]}. Keep titles under 12 words and details specific. Page insight: ${JSON.stringify({ pageUrl: insight.pageUrl, topQuery: insight.topQuery, metrics: insight.latest, delta: insight.delta, opportunities: insight.opportunities, fallback })}`,
      }],
    }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as { actionPlan?: ActionPlanItem[] };
    return Array.isArray(parsed.actionPlan) && parsed.actionPlan.length ? parsed.actionPlan.slice(0, 6) : null;
  } catch {
    return null;
  }
}

function actionDetail(opportunity: string) {
  const details: Record<string, string> = {
    needs_attention: "Compare the latest ranking query against the page content and refresh sections that no longer match the SERP.",
    low_ctr: "Keep the URL, but test a clearer title/meta angle around the top query.",
    almost_ranking: "Add depth for the top query and point relevant internal links at this page.",
    page_two: "Treat this as a near-win: expand topical coverage and strengthen internal anchors.",
    weak_focus: "Choose one primary query, then make headings and intro match that intent.",
    zero_clicks: "The page is visible but not earning clicks; improve snippet relevance first.",
    growing: "Protect the gain with fresh examples and internal links from related pages.",
    wrong_page_risk: "Review competing URLs for the same query and consolidate or differentiate intent.",
  };
  return details[opportunity] || "Review this page when new data arrives.";
}

function expectedCtr(position: number) {
  if (position <= 3) return 0.08;
  if (position <= 10) return 0.03;
  if (position <= 20) return 0.01;
  return 0.005;
}

function opportunityScore(page: PageInsight) {
  const weights: Record<string, number> = {
    needs_attention: 100,
    low_ctr: 80,
    zero_clicks: 70,
    almost_ranking: 60,
    page_two: 50,
    weak_focus: 40,
    wrong_page_risk: 30,
    growing: 10,
  };
  return page.opportunities.reduce((sum, item) => sum + (weights[item] || 0), 0);
}

function opportunityCounts(insights: PageInsight[]) {
  return insights.reduce((counts, page) => {
    for (const opportunity of page.opportunities) counts[opportunity] = (counts[opportunity] || 0) + 1;
    return counts;
  }, {} as Record<string, number>);
}

function buildQueryWinners(rows: GscMetric[]) {
  const winners = new Map<string, { pageUrl: string; clicks: number; position: number }>();
  for (const [query, queryRows] of groupBy(rows, (row) => row.query)) {
    const pages = Array.from(groupBy(queryRows, (row) => row.pageUrl).entries())
      .map(([pageUrl, pageRows]) => ({ pageUrl, ...summarizeMetricsWithCtr(pageRows) }))
      .sort((a, b) => b.clicks - a.clicks || a.position - b.position);
    if (pages[0]) winners.set(query, { pageUrl: pages[0].pageUrl, clicks: pages[0].clicks, position: pages[0].position });
  }
  return winners;
}

function queryIntentSummary(queries: string[]) {
  const text = Array.from(new Set(queries)).slice(0, 12).join(" ").toLowerCase();
  if (/\b(best|vs|review|price|cost|alternative|compare)\b/.test(text)) return "Commercial comparison intent";
  if (/\b(how|what|why|guide|tutorial|learn)\b/.test(text)) return "Informational intent";
  if (/\bnear me|login|contact|support\b/.test(text)) return "Navigational or local intent";
  return queries.length ? "Mixed search intent" : "No query intent available yet";
}

export function internalLinkTargets(index: unknown, pageUrl: string) {
  const pages = ((index as { pages?: Array<{ title?: string; url?: string; path?: string }> } | null)?.pages || [])
    .filter((page) => page.url && safeNormalizeHttpUrl(page.url) !== pageUrl);
  const pageTokens = tokenSet(pageUrl);
  return pages
    .map((page) => ({ ...page, score: overlap(pageTokens, tokenSet(`${page.title || ""} ${page.url || ""} ${page.path || ""}`)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map(({ score: _score, ...page }) => page);
}

function safeNormalizeHttpUrl(value: string) {
  try {
    return normalizeHttpUrl(value);
  } catch {
    return value;
  }
}

function tokenSet(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 3));
}

function overlap(a: Set<string>, b: Set<string>) {
  let count = 0;
  for (const item of a) if (b.has(item)) count += 1;
  return count;
}

function groupBy<T>(items: T[], key: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) || []), item]);
  return groups;
}

async function selectGscMetrics(userId: string, siteId: string): Promise<GscMetric[]> {
  return db
    .select({
      date: searchConsoleMetrics.date,
      pageUrl: searchConsoleMetrics.pageUrl,
      query: searchConsoleMetrics.query,
      clicks: searchConsoleMetrics.clicks,
      impressions: searchConsoleMetrics.impressions,
      ctr: searchConsoleMetrics.ctr,
      position: searchConsoleMetrics.position,
    })
    .from(searchConsoleMetrics)
    .where(and(eq(searchConsoleMetrics.userId, userId), eq(searchConsoleMetrics.siteId, siteId)));
}

async function snapshotPage(url: string): Promise<ContentSnapshot> {
  const [extracted, html] = await Promise.all([
    extractContent({ userId: "optimize", sourceType: "url", sourceValue: url }).catch((error) => {
      throw new Error(error instanceof Error ? error.message : "Failed to extract content");
    }),
    fetchHtml(url),
  ]);
  const content = extracted.content || "";
  return {
    url,
    title: extracted.title,
    wordCount: wordCount(content),
    sectionCount: sectionCount(html, content),
    features: {
      faq: hasFaq(html, content),
      table: /<table[\s>]/i.test(html),
      video: /<iframe[\s\S]+(?:youtube|vimeo)|<video[\s>]/i.test(html),
      tableOfContents: /table of contents|toc|href=["']#[^"']+/i.test(html),
      images: (html.match(/<img[\s>]/gi) || []).length,
    },
  };
}

async function fetchHtml(url: string) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; BlogFactory/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`URL returned ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !contentType.includes("html")) throw new Error("URL is not an HTML page");
  return response.text();
}

async function aiSuggestions(userId: string, targetQuery: string, own: ContentSnapshot, competitors: ContentSnapshot[]) {
  const key = await getOpenRouterKey(userId);
  if (!key) return null;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/gpt-5-mini",
      messages: [{
        role: "user",
        content: `Return JSON only: {"suggestions":[{"impact":"high|medium|low","title":"...","detail":"..."}]}. Target query: ${targetQuery}\nOwn page: ${JSON.stringify(own)}\nCompetitors: ${JSON.stringify(competitors)}`,
      }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) return null;
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const text = data.choices?.[0]?.message?.content || "";
  try {
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, "")) as { suggestions?: Suggestion[] };
    return Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 6) : null;
  } catch {
    return null;
  }
}

async function getSite(userId: string, siteId: string) {
  const [site] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1);
  if (!site) throw new Error("Site not found");
  return site;
}

function normalizeHttpUrl(value: string) {
  const parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only HTTP and HTTPS URLs are supported");
  parsed.hash = "";
  return parsed.toString();
}

function comparableHost(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

function wordCount(content: string) {
  return content.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function sectionCount(html: string, content: string) {
  const headings = (html.match(/<h[2-4][\s>]/gi) || []).length;
  if (headings) return headings;
  return Math.max(1, (content.match(/\n#{2,4}\s+/g) || []).length);
}

function hasFaq(html: string, content: string) {
  return /FAQ|Frequently Asked Questions|@type["']?\s*:\s*["']FAQPage/i.test(html)
    || /\b(who|what|when|where|why|how)\b[^.?!]{5,80}\?/i.test(content);
}

function emptyFeatures() {
  return { faq: false, table: false, video: false, tableOfContents: false, images: 0 };
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
