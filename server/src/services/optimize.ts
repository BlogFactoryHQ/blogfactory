import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { optimizeAnalyses, optimizePages, searchConsoleMetrics, sites } from "../db/schema.js";
import { extractContent } from "./extract-content.js";
import { getOpenRouterKey } from "./api-keys.js";

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
    groups.set(key, [...(groups.get(key) || []), metric]);
  }

  let updated = 0;
  for (const [key, rows] of groups) {
    const [pageUrl, query] = key.split("\n");
    const baseline = summarizeMetrics(rows.filter((row) => row.date >= baselineStart && row.date <= baselineEnd));
    const latest = summarizeMetrics(rows.filter((row) => row.date >= latestStart && row.date <= maxDate));

    const [existing] = await db
      .select({ optimizedAt: optimizePages.optimizedAt })
      .from(optimizePages)
      .where(and(
        eq(optimizePages.userId, userId),
        eq(optimizePages.siteId, siteId),
        eq(optimizePages.pageUrl, pageUrl),
        eq(optimizePages.targetQuery, query),
      ))
      .limit(1);

    const status = classifyOptimizeStatus({ baseline, latest, optimizedAt: existing?.optimizedAt });
    await db
      .insert(optimizePages)
      .values({
        userId,
        siteId,
        pageUrl,
        targetQuery: query,
        status,
        baselineMetrics: baseline as never,
        latestMetrics: latest as never,
      })
      .onConflictDoUpdate({
        target: [optimizePages.siteId, optimizePages.pageUrl, optimizePages.targetQuery],
        set: {
          status,
          baselineMetrics: baseline as never,
          latestMetrics: latest as never,
          updatedAt: new Date(),
        },
      });
    updated += 1;
  }

  return { updated };
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
