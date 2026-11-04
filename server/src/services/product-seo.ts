import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { campaignItems, campaigns, postPublications, posts, sites } from "../db/schema.js";
import { analyzeContent } from "./content-analysis.js";
import { evaluateSeoQa } from "./generation-output.js";
import { chunkKnowledgeContent } from "./knowledge.js";
import { sanitizePlanBrief, type PlanBrief } from "./plan-brief.js";
import { ensureSiteSettings, updateSiteSettings } from "./user-settings.js";
import { embeddingOverlap } from "./topic-embeddings.js";
import { withProviderKeys } from "./provider-keys.js";
import { fetchKeywordMetrics, rescoreWithVolume, volumeProviderConfigured } from "./keyword-volume.js";
import { buildArticleJsonLd, buildFaqJsonLd, buildLlmsTxt, extractFaq } from "./structured-data.js";
import { extractMainText, type InternalLinkIndex } from "./internal-linking.js";
import { publicFetchText } from "./public-fetch.js";
import { createTtlCache } from "./ttl-cache.js";
import { openRouterInferenceFetch, resolveOpenRouterAccess } from "./managed-openrouter.js";
import { addSeoGrowthPlanItem } from "./seo-growth-plan.js";

export const TOPIC_INTENTS = ["informational", "commercial", "comparison", "alternatives", "transactional"] as const;
export type TopicIntent = typeof TOPIC_INTENTS[number];

export interface ProductProfile {
  summary: string;
  audience: string[];
  problems: string[];
  features: string[];
  competitors: string[];
  seedTopics: string[];
  cta?: { label: string; description: string } | null;
  source: "ai" | "heuristic";
  pagesRead: string[];
}

export interface TopicCandidate {
  keyword: string;
  intent: TopicIntent;
  cluster: string;
  score: number;
  fit: number;
  sources: number;
  question: boolean;
  template: boolean;
  overlap: { title: string; similarity: number; method?: "title" | "embedding" } | null;
  volume?: number | null;
  competition?: string | null;
}

const PROFILE_MODEL = "google/gemini-3.5-flash";
const MAX_PAGES = 4;
const MAX_SEEDS = 8;
const SUGGEST_CONCURRENCY = 5;
const STOPWORDS = new Set("a an and are as at be by for from how in into is it of on or the to what when where which who why with your you i my do does can".split(" "));
const PREFIX_MODIFIERS = ["how to", "why", "what is", "can", "does"];
const SUFFIX_MODIFIERS = ["best", "vs", "alternative", "for"];
export const QUESTION_START = /^(how|what|why|can|does|is|are|should|when|which|who)\b/;
// 0.7: one swapped word in a four-word topic ("best X" vs "X shirt") is a different page, not a duplicate.
const OVERLAP_THRESHOLD = 0.7;
const COVERED_SHOWN = 10;

// ── pure helpers ──

export function cleanList(value: unknown, max: number, maxLength = 120): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const text = String(item ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeCta(value: unknown): { label: string; description: string } | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const label = String(record.label ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
  const description = String(record.description ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
  return label && description ? { label, description } : null;
}

export function normalizeProfile(raw: unknown, pagesRead: string[], source: ProductProfile["source"]): ProductProfile {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    summary: String(data.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
    audience: cleanList(data.audience, 6),
    problems: cleanList(data.problems, 8),
    features: cleanList(data.features, 10),
    competitors: cleanList(data.competitors, 8, 60),
    seedTopics: cleanList(data.seedTopics, MAX_SEEDS * 2, 80),
    cta: normalizeCta(data.cta),
    source,
    pagesRead,
  };
}

export function parseProfileJson(text: string, pagesRead: string[]): ProductProfile | null {
  try {
    const profile = normalizeProfile(JSON.parse(text.replace(/^```json\s*|\s*```$/g, "").trim()), pagesRead, "ai");
    return profile.summary && profile.seedTopics.length ? profile : null;
  } catch {
    return null;
  }
}

export function tokens(value: string) {
  return value.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter((token) => token.length > 1 && !STOPWORDS.has(token));
}

export function heuristicProfile(page: { title: string; description: string; headings: string[] }, pagesRead: string[]): ProductProfile {
  const seedTopics = cleanList([page.title.split(/[|\-–—:]/)[0], ...page.headings], MAX_SEEDS, 60)
    .filter((topic) => tokens(topic).length >= 1 && tokens(topic).length <= 6);
  return normalizeProfile({
    summary: page.description || page.title,
    features: page.headings.slice(0, 8),
    seedTopics,
  }, pagesRead, "heuristic");
}

export function classifyIntent(keyword: string): TopicIntent {
  const value = keyword.toLowerCase();
  if (/\balternatives?\b|\bsimilar to\b|\binstead of\b/.test(value)) return "alternatives";
  if (/\bvs\b|\bversus\b|\bcompared? to\b/.test(value)) return "comparison";
  if (/\b(best|top|review|reviews|pricing|price)\b/.test(value)) return "commercial";
  if (/\b(buy|download|free trial|sign ?up|discount|coupon)\b/.test(value)) return "transactional";
  return "informational";
}

export const INTENT_WEIGHT: Record<TopicIntent, number> = { comparison: 1, alternatives: 1, commercial: 0.9, transactional: 0.7, informational: 0.6 };

export function productFit(keyword: string, profile: Pick<ProductProfile, "features" | "problems" | "audience" | "seedTopics" | "competitors">) {
  const keywordTokens = new Set(tokens(keyword));
  if (!keywordTokens.size) return 0;
  const context = new Set(tokens([...profile.features, ...profile.problems, ...profile.audience, ...profile.seedTopics].join(" ")));
  let hits = 0;
  for (const token of keywordTokens) if (context.has(token)) hits += 1;
  const mentionsCompetitor = profile.competitors.some((name) => keyword.toLowerCase().includes(name.toLowerCase()));
  return Math.min(1, hits / keywordTokens.size + (mentionsCompetitor ? 0.3 : 0));
}

export function buildSeedQueries(seeds: string[], competitors: string[]) {
  const queries = new Set<string>();
  for (const seed of seeds.slice(0, MAX_SEEDS)) {
    queries.add(seed);
    for (const modifier of PREFIX_MODIFIERS) queries.add(`${modifier} ${seed}`);
    for (const modifier of SUFFIX_MODIFIERS) queries.add(`${seed} ${modifier}`);
  }
  for (const competitor of competitors.slice(0, 4)) {
    queries.add(`${competitor} alternative`);
    queries.add(`${competitor} vs`);
  }
  return [...queries].slice(0, 80);
}

export function clusterKeywords(keywords: string[], threshold = 0.5) {
  const clusters: Array<{ label: string; members: string[]; tokenSet: Set<string> }> = [];
  for (const keyword of keywords) {
    const set = new Set(tokens(keyword));
    let best: typeof clusters[number] | null = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const shared = [...set].filter((token) => cluster.tokenSet.has(token)).length;
      const score = shared / Math.max(1, Math.min(set.size, cluster.tokenSet.size));
      if (score > bestScore) { best = cluster; bestScore = score; }
    }
    if (best && bestScore >= threshold) {
      best.members.push(keyword);
      for (const token of set) best.tokenSet.add(token);
    } else {
      clusters.push({ label: keyword, members: [keyword], tokenSet: set });
    }
  }
  return clusters.map((cluster) => ({
    label: [...cluster.members].sort((a, b) => a.length - b.length)[0],
    members: cluster.members,
  }));
}

export function stem(token: string) {
  return token.length > 3 ? token.replace(/(ing|ers|er|es|s)$/, "") : token;
}

export function topicSimilarity(left: string, right: string) {
  const a = new Set(tokens(left).map(stem));
  const b = new Set(tokens(right).map(stem));
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const token of a) if (b.has(token)) shared += 1;
  return shared / (a.size + b.size - shared);
}

export function findOverlap(keyword: string, existingTitles: string[]) {
  let best: { title: string; similarity: number; method: "title" } | null = null;
  for (const title of existingTitles) {
    const similarity = topicSimilarity(keyword, title);
    if (similarity >= OVERLAP_THRESHOLD && (!best || similarity > best.similarity)) best = { title, similarity: Math.round(similarity * 100) / 100, method: "title" };
  }
  return best;
}

export function templateTopics(profile: Pick<ProductProfile, "competitors" | "seedTopics">, productName: string) {
  const topics: string[] = [];
  for (const competitor of profile.competitors.slice(0, 4)) {
    topics.push(`${competitor} alternatives`, `${productName} vs ${competitor}`);
  }
  for (const seed of profile.seedTopics.slice(0, 3)) topics.push(`best ${seed}`);
  return topics.map((topic) => topic.toLowerCase());
}

export function rankTopics(
  suggestions: Array<{ keyword: string; position: number; hits: number }>,
  profile: ProductProfile,
  limit = 40,
  context: { existingTitles?: string[]; templates?: string[] } = {},
): TopicCandidate[] {
  const templateSet = new Set((context.templates || []).map((topic) => topic.toLowerCase()));
  const pool = [...suggestions, ...[...templateSet].map((keyword) => ({ keyword, position: 0, hits: 2 }))];
  const unique = new Map<string, { keyword: string; position: number; hits: number }>();
  for (const item of pool) {
    const key = item.keyword.toLowerCase().trim();
    if (!key || tokens(key).length < 2 || key.length > 90) continue;
    const prev = unique.get(key);
    if (prev) { prev.hits += item.hits; prev.position = Math.min(prev.position, item.position); }
    else unique.set(key, { ...item, keyword: key });
  }
  const clusters = clusterKeywords([...unique.keys()]);
  const clusterOf = new Map<string, string>();
  for (const cluster of clusters) for (const member of cluster.members) clusterOf.set(member, cluster.label);
  const scored = [...unique.values()].map((item) => {
    const intent = classifyIntent(item.keyword);
    const fit = productFit(item.keyword, profile);
    // Autocomplete rank is a demand proxy: early position and repeat appearances mean people actually type it.
    const demand = Math.min(1, (1 - Math.min(item.position, 9) / 10) * 0.7 + Math.min(item.hits, 4) * 0.075);
    const overlap = findOverlap(item.keyword, context.existingTitles || []);
    const raw = Math.round((demand * 0.4 + fit * 0.4 + INTENT_WEIGHT[intent] * 0.2) * 100);
    // Topics we already cover would cannibalize an existing page, so they sink instead of vanishing.
    const score = overlap ? Math.max(0, raw - 40) : raw;
    return {
      keyword: item.keyword, intent, cluster: clusterOf.get(item.keyword) || item.keyword, score,
      fit: Math.round(fit * 100) / 100, sources: item.hits,
      question: QUESTION_START.test(item.keyword), template: templateSet.has(item.keyword), overlap,
    };
  }).sort((a, b) => b.score - a.score);
  // Covered topics stay visible (flagged, lower) instead of being cut off by the limit, so you can see what you already own.
  const fresh = scored.filter((topic) => !topic.overlap).slice(0, limit);
  const covered = scored.filter((topic) => topic.overlap).slice(0, COVERED_SHOWN);
  return [...fresh, ...covered].sort((a, b) => b.score - a.score);
}

// ── network ──

export async function fetchPage(url: string) {
  const page = await publicFetchText(url, { accept: "text/html", requireHtml: true });
  return page ? { html: page.text, url: page.url } : null;
}

export function strip(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
}

function pageSummary(html: string) {
  const title = strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)["']/i)?.[1] || "";
  const headings = [...html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi)].map((match) => strip(match[1])).filter(Boolean).slice(0, 12);
  return { title, description: strip(description), headings, text: extractMainText(html) };
}

function candidateLinks(html: string, base: string) {
  const origin = new URL(base);
  const wanted = /(feature|pricing|product|how-it-works|about|solutions?|use-cases?)/i;
  const out: string[] = [];
  for (const match of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    try {
      const link = new URL(match[1], origin);
      if (link.hostname.replace(/^www\./, "") !== origin.hostname.replace(/^www\./, "")) continue;
      if (wanted.test(link.pathname) && !out.includes(link.href)) out.push(link.href);
    } catch { /* ignore malformed href */ }
  }
  return out.slice(0, MAX_PAGES - 1);
}

async function crawlProduct(domain: string) {
  const start = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
  const home = await fetchPage(start);
  if (!home) throw new Error("Could not read the site. Check that the URL is public and serves HTML.");
  const extra = await Promise.all(candidateLinks(home.html, home.url).map((url) => fetchPage(url)));
  const pages = [home, ...extra.filter((page): page is NonNullable<typeof page> => Boolean(page))];
  const summaries = pages.map((page) => ({ url: page.url, ...pageSummary(page.html) }));
  return summaries;
}

async function aiProfile(userId: string, summaries: Awaited<ReturnType<typeof crawlProduct>>, language: string | null) {
  try { await resolveOpenRouterAccess(userId); } catch { return null; }
  const material = summaries.map((page) => `URL: ${page.url}\nTitle: ${page.title}\nDescription: ${page.description}\nHeadings: ${page.headings.join(" | ")}\nText: ${page.text.slice(0, 2500)}`).join("\n\n");
  const response = await openRouterInferenceFetch(userId, "https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: PROFILE_MODEL,
      messages: [{
        role: "user",
        content: `You analyse a product website for an SEO content team. Use only facts present in the material; never invent features or competitors. Return JSON only: {"summary":"1-2 sentences what the product does and for whom","audience":["..."],"problems":["problems users search to solve"],"features":["real features"],"competitors":["named competitors or well-known alternatives in the same category"],"seedTopics":["8-10 short search phrases (2-4 words) a potential customer would type, written in ${language || "the site's language"}"],"cta":{"label":"short button text under 5 words","description":"one sentence under 20 words inviting the reader to try the product, using only facts present"}}\n\n${material}`,
      }],
    }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  return parseProfileJson(data.choices?.[0]?.message?.content || "", summaries.map((page) => page.url));
}

const suggestCache = createTtlCache<string[]>(12 * 60 * 60 * 1000, 1000);

export async function suggestQueries(query: string, language: string) {
  const key = `${language}:${query.toLowerCase()}`;
  const hit = suggestCache.get(key);
  if (hit) return hit;
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=${encodeURIComponent(language)}&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(5000), headers: { "User-Agent": "BlogFactoryBot/1.0 (+https://blogfactory.io)" } }).catch(() => null);
  if (!response?.ok) return [];
  const data = await response.json().catch(() => null) as [string, string[]] | null;
  const list = Array.isArray(data?.[1]) ? data![1].map(String) : [];
  if (list.length) suggestCache.set(key, list);
  return list;
}

// ── product knowledge (win 2) ──

export const PRODUCT_KNOWLEDGE_SOURCE = "product_profile";
const KNOWLEDGE_PAGE_CHARS = 2500;
const KNOWLEDGE_MAX_CHARS = 20_000;

export function buildProductKnowledgeDoc(
  siteName: string,
  profile: ProductProfile,
  pages: Array<{ url: string; title: string; text: string }>,
) {
  const list = (items: string[]) => items.map((item) => `- ${item}`).join("\n");
  const sections = [
    `# ${siteName}: product facts`,
    "Facts below were read from the product website. Use them for accurate feature claims, audience and positioning. Do not invent features that are not listed here.",
    profile.summary && `## Summary\n${profile.summary}`,
    profile.audience.length && `## Audience\n${list(profile.audience)}`,
    profile.problems.length && `## Problems it solves\n${list(profile.problems)}`,
    profile.features.length && `## Features\n${list(profile.features)}`,
    ...pages.map((page) => `## Page: ${page.title || page.url}\nSource: ${page.url}\n${page.text.slice(0, KNOWLEDGE_PAGE_CHARS)}`),
  ].filter(Boolean) as string[];
  const content = sections.join("\n\n").slice(0, KNOWLEDGE_MAX_CHARS);
  return {
    title: `Product site: ${siteName}`,
    content,
    status: "ready" as const,
    source: PRODUCT_KNOWLEDGE_SOURCE,
    chunks: chunkKnowledgeContent(content),
  };
}

export function mergeProductKnowledge(existing: unknown, doc: ReturnType<typeof buildProductKnowledgeDoc>) {
  const others = (Array.isArray(existing) ? existing : []).filter((item) => !(item && typeof item === "object" && (item as { source?: unknown }).source === PRODUCT_KNOWLEDGE_SOURCE));
  return [...others, doc];
}

async function saveProductKnowledge(userId: string, siteId: string, siteName: string, profile: ProductProfile, pages: Array<{ url: string; title: string; text: string }>) {
  const settings = await ensureSiteSettings(userId, siteId);
  const doc = buildProductKnowledgeDoc(siteName, profile, pages);
  const updated = await updateSiteSettings(userId, siteId, { knowledgeDocuments: mergeProductKnowledge(settings.knowledgeDocuments, doc) } as never);
  return { saved: true, enabled: Boolean(updated.knowledgeBaseEnabled) };
}

export async function productKnowledgeState(userId: string, siteId: string) {
  const settings = await ensureSiteSettings(userId, siteId);
  const docs = Array.isArray(settings.knowledgeDocuments) ? settings.knowledgeDocuments as Array<{ source?: unknown }> : [];
  return { saved: docs.some((doc) => doc?.source === PRODUCT_KNOWLEDGE_SOURCE), enabled: Boolean(settings.knowledgeBaseEnabled) };
}

export async function enableKnowledgeBase(userId: string, siteId: string) {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  await updateSiteSettings(userId, siteId, { knowledgeBaseEnabled: true } as never);
  return productKnowledgeState(userId, siteId);
}

export async function applyProfileCta(userId: string, siteId: string) {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  const cta = normalizeCta((site.productProfile as ProductProfile | null)?.cta);
  if (!cta) throw new Error("The profile has no suggested CTA. Re-read the site with an AI key.");
  const settings = await ensureSiteSettings(userId, siteId);
  const current = (Array.isArray(settings.brandCtas) ? settings.brandCtas : []) as Array<{ label?: string; url?: string; description?: string }>;
  const url = `https://${site.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  // Publishing appends the first CTA only, so the suggestion goes first and the rest stay as fallbacks.
  const next = [{ label: cta.label, url, description: cta.description }, ...current.filter((item) => item?.label !== cta.label)].slice(0, 5);
  await updateSiteSettings(userId, siteId, { brandCtas: next } as never);
  return { cta: { ...cta, url }, total: next.length };
}

// ── persistence-backed operations ──

export async function ownedSiteRow(userId: string, siteId: string) {
  const [site] = await db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, userId))).limit(1);
  return site || null;
}

export async function getProductProfile(userId: string, siteId: string) {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  return { profile: (site.productProfile as ProductProfile | null) ?? null, updatedAt: site.productProfileUpdatedAt, knowledge: await productKnowledgeState(userId, siteId), suggestions: site.topicSuggestions ?? null, suggestionsCheckedAt: site.topicSuggestionsCheckedAt };
}

export async function generateProductProfile(userId: string, siteId: string) {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  const summaries = await crawlProduct(site.domain);
  const profile = (await aiProfile(userId, summaries, site.language))
    || heuristicProfile(summaries[0], summaries.map((page) => page.url));
  const updatedAt = new Date();
  await db.update(sites).set({ productProfile: profile, productProfileUpdatedAt: updatedAt })
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  const knowledge = await saveProductKnowledge(userId, siteId, site.name, profile, summaries);
  return { profile, updatedAt, knowledge };
}

export async function saveProductProfile(userId: string, siteId: string, raw: unknown) {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  const previous = (site.productProfile as ProductProfile | null) ?? null;
  const profile = normalizeProfile(raw, previous?.pagesRead || [], previous?.source || "heuristic");
  if (!profile.summary || !profile.seedTopics.length) throw new Error("Profile needs a summary and at least one seed topic");
  const updatedAt = new Date();
  await db.update(sites).set({ productProfile: profile, productProfileUpdatedAt: updatedAt })
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return { profile, updatedAt };
}

export async function existingSiteTitles(userId: string, siteId: string, site: { internalLinkIndex: unknown }) {
  const [postRows, planRows] = await Promise.all([
    db.select({ title: posts.title }).from(posts).where(and(eq(posts.userId, userId), eq(posts.siteId, siteId))).orderBy(desc(posts.updatedAt)).limit(500),
    db.select({ keyword: campaignItems.keyword }).from(campaignItems).innerJoin(campaigns, eq(campaigns.id, campaignItems.campaignId))
      .where(and(eq(campaigns.userId, userId), eq(campaigns.siteId, siteId), isNotNull(campaignItems.keyword))).limit(500),
  ]);
  const indexed = ((site.internalLinkIndex as InternalLinkIndex | null)?.pages || []).map((page) => page.title);
  return [...postRows.map((row) => row.title), ...planRows.map((row) => row.keyword || ""), ...indexed].filter(Boolean);
}

export function discoverTopics(userId: string, siteId: string) {
  return withProviderKeys(userId, () => discoverTopicsScoped(userId, siteId));
}

async function discoverTopicsScoped(userId: string, siteId: string) {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  const profile = site.productProfile as ProductProfile | null;
  if (!profile?.seedTopics?.length) throw new Error("Generate the product profile first");
  const language = (site.language || "en").slice(0, 2).toLowerCase();
  const queries = buildSeedQueries(profile.seedTopics, profile.competitors);
  const collected: Array<{ keyword: string; position: number; hits: number }> = [];
  for (let index = 0; index < queries.length; index += SUGGEST_CONCURRENCY) {
    const batch = queries.slice(index, index + SUGGEST_CONCURRENCY);
    const results = await Promise.all(batch.map((query) => suggestQueries(query, language)));
    results.forEach((list) => list.forEach((keyword, position) => collected.push({ keyword, position, hits: 1 })));
  }
  const existingTitles = await existingSiteTitles(userId, siteId, site);
  const templates = templateTopics(profile, site.name);
  let ranked = rankTopics(collected, profile, 40, { existingTitles, templates });
  if (volumeProviderConfigured()) {
    try { ranked = rescoreWithVolume(ranked, await fetchKeywordMetrics(ranked.map((topic) => topic.keyword), language)); } catch { /* keep the autocomplete score */ }
  }
  const topics = await embeddingOverlap(userId, ranked, site.internalLinkIndex as InternalLinkIndex | null);
  return { topics, queriesRun: queries.length };
}

export async function addTopicsToPlan(userId: string, siteId: string, keywords: string[], briefs: Record<string, unknown> = {}) {
  const cleanBriefs = new Map<string, PlanBrief>();
  for (const [key, raw] of Object.entries(briefs).slice(0, 30)) {
    const brief = sanitizePlanBrief(raw);
    if (brief) cleanBriefs.set(key.trim().toLowerCase(), brief);
  }
  const added = [];
  for (const keyword of cleanList(keywords, 30, 90)) {
    const item = await addSeoGrowthPlanItem({ userId, siteId, targetQuery: keyword, actionType: "new_content", title: keyword });
    if (item === null) return null;
    const brief = cleanBriefs.get(keyword.toLowerCase());
    if (brief) {
      const evidence = { ...((item.evidence as Record<string, unknown> | null) || {}), brief };
      const [updated] = await db.update(campaignItems).set({ outline: brief.outline, evidence, updatedAt: new Date() })
        .where(and(eq(campaignItems.id, item.id), eq(campaignItems.userId, userId))).returning();
      added.push(updated || item);
    } else added.push(item);
  }
  return added;
}

// Best topic of each cluster first (breadth), then spokes for the strongest clusters (depth, at most 3 per cluster).
// Skips pages we already cover and keeps guides from crowding out buying-intent topics.
export function pickPlanTopics(topics: TopicCandidate[], limit = 12) {
  const sorted = [...topics].filter((topic) => !topic.overlap).sort((a, b) => b.score - a.score);
  const picked: TopicCandidate[] = [];
  const perCluster = new Map<string, number>();
  const perIntent = new Map<TopicIntent, number>();
  const intentCap = Math.max(1, Math.ceil(limit / 2));
  const take = (topic: TopicCandidate) => {
    picked.push(topic);
    perCluster.set(topic.cluster, (perCluster.get(topic.cluster) || 0) + 1);
    perIntent.set(topic.intent, (perIntent.get(topic.intent) || 0) + 1);
  };
  for (const topic of sorted) {
    if (picked.length >= limit) break;
    if (!perCluster.has(topic.cluster) && (perIntent.get(topic.intent) || 0) < intentCap) take(topic);
  }
  for (const topic of sorted) {
    if (picked.length >= limit) break;
    if (picked.includes(topic) || (perCluster.get(topic.cluster) || 0) >= 3 || (perIntent.get(topic.intent) || 0) >= intentCap) continue;
    take(topic);
  }
  return picked.sort((a, b) => b.score - a.score);
}

export async function fillPlan(userId: string, siteId: string, limit = 12) {
  const discovered = await discoverTopics(userId, siteId);
  if (!discovered) return null;
  const picked = pickPlanTopics(discovered.topics, Math.min(Math.max(limit, 1), 30));
  if (!picked.length) return { picked, items: [] };
  const items = await addTopicsToPlan(userId, siteId, picked.map((topic) => topic.keyword));
  return items === null ? null : { picked, items };
}

export async function getPlanItemBrief(userId: string, siteId: string, itemId: string) {
  const [row] = await db.select({ evidence: campaignItems.evidence }).from(campaignItems)
    .innerJoin(campaigns, eq(campaigns.id, campaignItems.campaignId))
    .where(and(eq(campaignItems.id, itemId), eq(campaignItems.userId, userId), eq(campaigns.userId, userId), eq(campaigns.siteId, siteId))).limit(1);
  if (!row) return null;
  const brief = sanitizePlanBrief((row.evidence as { brief?: unknown } | null)?.brief);
  return { brief };
}

// ── content analysis, structured data, llms.txt ──

export async function analyzePostContent(userId: string, postId: string, keyword?: string) {
  const [post] = await db.select({ id: posts.id, siteId: posts.siteId, title: posts.title, content: posts.content, campaignItemId: posts.campaignItemId })
    .from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1);
  if (!post) return null;
  let usedKeyword = keyword?.trim() || null;
  if (!usedKeyword && post.campaignItemId) {
    const [item] = await db.select({ keyword: campaignItems.keyword }).from(campaignItems)
      .where(and(eq(campaignItems.id, post.campaignItemId), eq(campaignItems.userId, userId))).limit(1);
    usedKeyword = item?.keyword?.trim() || null;
  }
  const [siblings, site] = await Promise.all([
    post.siteId
      ? db.select({ id: posts.id, title: posts.title, content: posts.content }).from(posts)
        .where(and(eq(posts.userId, userId), eq(posts.siteId, post.siteId))).orderBy(desc(posts.updatedAt)).limit(200)
      : Promise.resolve([]),
    post.siteId ? ownedSiteRow(userId, post.siteId) : Promise.resolve(null),
  ]);
  const analysis = analyzeContent(post.content, { keyword: usedKeyword || undefined, title: post.title, siblings, ownId: post.id });
  const seoQa = evaluateSeoQa(post.content, { keyword: usedKeyword || undefined, settings: { internalLinkIndex: site?.internalLinkIndex ?? null } as never });
  return { ...analysis, seoQa, usedKeyword };
}

export async function postStructuredData(userId: string, postId: string) {
  const [post] = await db.select().from(posts).where(and(eq(posts.id, postId), eq(posts.userId, userId))).limit(1);
  if (!post) return null;
  const [site] = post.siteId ? await db.select().from(sites).where(and(eq(sites.id, post.siteId), eq(sites.userId, userId))).limit(1) : [];
  const [publication] = await db.select({ url: postPublications.externalUrl }).from(postPublications)
    .where(and(eq(postPublications.userId, userId), eq(postPublications.postId, post.id), isNotNull(postPublications.externalUrl)))
    .orderBy(desc(postPublications.updatedAt)).limit(1);
  const seo = (post.seoMetadata && typeof post.seoMetadata === "object" ? post.seoMetadata : {}) as { metaDescription?: string; meta_description?: string; description?: string };
  const article = buildArticleJsonLd({
    title: post.title,
    description: seo.metaDescription || seo.meta_description || seo.description || post.summary,
    url: publication?.url,
    image: post.coverImageUrl,
    dateModified: post.updatedAt.toISOString(),
    datePublished: post.createdAt.toISOString(),
    publisherName: site?.name,
    language: site?.language,
  });
  return { article, faq: buildFaqJsonLd(extractFaq(post.content)) };
}

export async function siteLlmsTxt(userId: string, siteId: string) {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  const published = await db.select({ title: posts.title, url: postPublications.externalUrl, summary: posts.summary })
    .from(postPublications).innerJoin(posts, eq(posts.id, postPublications.postId))
    .where(and(eq(postPublications.userId, userId), eq(postPublications.siteId, siteId), isNotNull(postPublications.externalUrl), eq(postPublications.status, "published")))
    .orderBy(desc(postPublications.updatedAt)).limit(100);
  const index = site.internalLinkIndex as InternalLinkIndex | null;
  const profile = site.productProfile as ProductProfile | null;
  return buildLlmsTxt({
    name: site.name,
    summary: profile?.summary,
    pages: (index?.pages || []).slice(0, 40).map((page) => ({ title: page.title || page.path, url: page.url, description: page.description })),
    posts: published.map((row) => ({ title: row.title, url: row.url || "", description: row.summary })),
  });
}
