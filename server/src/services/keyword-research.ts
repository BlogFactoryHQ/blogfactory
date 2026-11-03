// Keyword research without paid data: a People-Also-Ask style question tree from Google autocomplete,
// plus an optional SERP brief when a Brave Search API key is configured. No search-engine HTML scraping.
import { createTtlCache } from "./ttl-cache.js";
import { extractTerms, type SerpTerm } from "./term-coverage.js";
import { fetchKeywordMetrics, volumeProviderConfigured, type KeywordMetrics } from "./keyword-volume.js";
import { QUESTION_START, fetchPage, ownedSiteRow, strip, suggestQueries, topicSimilarity } from "./product-seo.js";

export const QUESTION_WORDS = ["what", "why", "how", "can", "does", "is", "are", "should", "when", "which"] as const;
const SUFFIXES = ["for", "with", "without", "vs", "or"];
const SERP_PAGES = 8;
const PAGE_CONCURRENCY = 4;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX = 100;
const MAX_PER_FAMILY = 3;

export interface SerpResult { title: string; url: string; description: string }
export interface PageOutline { url: string; title: string; headings: string[]; words: number }
export interface SerpBrief {
  targetWords: number;
  medianWords: number;
  sharedHeadings: Array<{ heading: string; pages: number }>;
  suggestedOutline: string[];
  faq: string[];
  terms?: SerpTerm[];
}
export interface KeywordResearch {
  keyword: string;
  questions: Array<{ question: string; word: string; depth: 1 | 2 }>;
  related: string[];
  serp: { provider: "brave"; results: SerpResult[]; outlines: PageOutline[]; brief: SerpBrief } | null;
  metrics?: KeywordMetrics | null;
  notes: string[];
}

// ── pure helpers ──

export function groupQuestions(
  found: Array<{ text: string; depth: 1 | 2 }>,
  keyword: string,
  max = 30,
) {
  const keyTokens = keyword.toLowerCase().split(/\s+/).filter((token) => token.length > 2);
  const seen = new Set<string>();
  const families = new Map<string, number>();
  const out: KeywordResearch["questions"] = [];
  for (const { text, depth } of found) {
    const question = text.toLowerCase().replace(/\s+/g, " ").trim();
    const word = question.match(QUESTION_START)?.[1];
    if (!word || seen.has(question) || question.length > 120) continue;
    if (keyTokens.length && !keyTokens.some((token) => question.includes(token.slice(0, Math.max(3, token.length - 2))))) continue;
    // Autocomplete returns families ("how long does it take to see hair growth with X"); keep a few of each.
    const family = question.split(" ").slice(0, 5).join(" ");
    if ((families.get(family) || 0) >= MAX_PER_FAMILY) continue;
    families.set(family, (families.get(family) || 0) + 1);
    seen.add(question);
    out.push({ question, word, depth });
  }
  // Questions that keep more of the keyword come first, so shortened-head results do not outrank exact ones.
  const matches = (question: string) => keyTokens.filter((token) => question.includes(token.slice(0, Math.max(3, token.length - 2)))).length;
  out.sort((a, b) => matches(b.question) - matches(a.question));
  // Keep variety: round-robin across question words so "how" does not crowd out "can".
  const byWord = new Map<string, typeof out>();
  for (const item of out) byWord.set(item.word, [...(byWord.get(item.word) || []), item]);
  const interleaved: typeof out = [];
  for (let round = 0; interleaved.length < Math.min(max, out.length); round += 1) {
    let added = false;
    for (const list of byWord.values()) if (list[round]) { interleaved.push(list[round]); added = true; }
    if (!added) break;
  }
  return interleaved.slice(0, max);
}

export function headingsFromHtml(html: string) {
  return [...html.matchAll(/<h([23])[^>]*>([\s\S]*?)<\/h\1>/gi)]
    .map((match) => strip(match[2]).replace(/^\d+[.)]\s*/, ""))
    .filter((heading) => heading.length >= 4 && heading.length <= 120);
}

export function wordCountFromHtml(html: string) {
  const body = html.replace(/<(script|style|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ");
  return strip(body).split(/\s+/).filter(Boolean).length;
}

export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function buildSerpBrief(outlines: PageOutline[], questions: string[]): SerpBrief {
  const groups: Array<{ heading: string; pages: Set<string> }> = [];
  for (const outline of outlines) {
    for (const heading of outline.headings) {
      const group = groups.find((item) => topicSimilarity(item.heading, heading) >= 0.75);
      if (group) group.pages.add(outline.url);
      else groups.push({ heading, pages: new Set([outline.url]) });
    }
  }
  const sharedHeadings = groups.filter((group) => group.pages.size >= 2)
    .sort((a, b) => b.pages.size - a.pages.size).slice(0, 12)
    .map((group) => ({ heading: group.heading, pages: group.pages.size }));
  const medianWords = median(outlines.map((outline) => outline.words).filter((count) => count > 200));
  const targetWords = medianWords ? Math.min(2500, Math.max(900, Math.round((medianWords * 1.1) / 50) * 50)) : 1500;
  const faq = questions.slice(0, 6);
  return {
    targetWords,
    medianWords,
    sharedHeadings,
    suggestedOutline: [...sharedHeadings.slice(0, 8).map((item) => item.heading), ...(faq.length ? ["FAQ"] : [])],
    faq,
  };
}

// ── network ──

const serpCache = createTtlCache<SerpResult[]>(CACHE_TTL_MS, CACHE_MAX);

export function serpProviderConfigured() {
  return Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());
}

export async function searchSerp(query: string, country: string, language: string, options: { count?: number; fresh?: boolean } = {}): Promise<SerpResult[]> {
  const key = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) return [];
  const count = Math.min(Math.max(options.count ?? 10, 1), 20);
  const cacheKey = `serp:${country}:${language}:${count}:${query.toLowerCase()}`;
  const hit = options.fresh ? undefined : serpCache.get(cacheKey);
  if (hit) return hit;
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));
  url.searchParams.set("country", country.toUpperCase());
  url.searchParams.set("search_lang", language);
  const response = await fetch(url, { headers: { Accept: "application/json", "X-Subscription-Token": key }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!response?.ok) throw new Error(`Search provider returned ${response?.status ?? "no response"}`);
  const data = await response.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
  const results = (data.web?.results || []).filter((item) => item.url && item.title)
    .map((item) => ({ title: strip(item.title!), url: item.url!, description: strip(item.description || "") }));
  serpCache.set(cacheKey, results);
  return results;
}

interface SerpPage { outline: PageOutline; text: string }
const pageCache = createTtlCache<{ results: SerpResult[]; pages: SerpPage[] }>(CACHE_TTL_MS, 50);

async function readSerpPage(result: SerpResult): Promise<SerpPage | null> {
  const page = await fetchPage(result.url).catch(() => null);
  if (!page) return null;
  const body = page.html.replace(/<(script|style|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ");
  return {
    outline: { url: result.url, title: result.title, headings: headingsFromHtml(page.html), words: wordCountFromHtml(page.html) },
    text: strip(body).slice(0, 30_000),
  };
}

// Search once, read the top pages once, and reuse for the brief and for term coverage.
export async function loadSerpPages(term: string, country: string, language: string) {
  const key = `${country}:${language}:${term}`;
  const hit = pageCache.get(key);
  if (hit) return hit;
  const results = await searchSerp(term, country, language);
  const pool = results.slice(0, SERP_PAGES);
  const pages: SerpPage[] = [];
  for (let index = 0; index < pool.length; index += PAGE_CONCURRENCY) {
    const batch = await Promise.all(pool.slice(index, index + PAGE_CONCURRENCY).map(readSerpPage));
    pages.push(...batch.filter((item): item is SerpPage => Boolean(item)));
  }
  const loaded = { results, pages };
  if (pages.length) pageCache.set(key, loaded);
  return loaded;
}

export function countryFor(language: string) {
  return language === "tr" ? "TR" : language === "en" ? "US" : language.toUpperCase();
}

export async function getSerpTerms(term: string, language: string) {
  const { pages } = await loadSerpPages(term, countryFor(language), language);
  return extractTerms(pages.map((page) => page.text), { keyword: term });
}

export async function questionTree(keyword: string, language: string, maxRequests = 40) {
  const found: Array<{ text: string; depth: 1 | 2 }> = [];
  const related = new Set<string>();
  // Autocomplete only completes prefixes people really type: "what hair growth tracker" returns nothing while "what hair growth" returns ten.
  // So the question words are also tried on the keyword without its last word.
  const parts = keyword.split(/\s+/);
  const heads = parts.length >= 3 ? [keyword, parts.slice(0, -1).join(" ")] : [keyword];
  const firstLevel = [...heads.flatMap((head) => QUESTION_WORDS.map((word) => `${word} ${head}`)), ...SUFFIXES.map((suffix) => `${keyword} ${suffix}`), keyword];
  let used = 0;
  const run = async (queries: string[], depth: 1 | 2) => {
    for (let index = 0; index < queries.length && used < maxRequests; index += 5) {
      const batch = queries.slice(index, index + 5);
      used += batch.length;
      const lists = await Promise.all(batch.map((query) => suggestQueries(query, language)));
      for (const list of lists) for (const text of list) {
        if (QUESTION_START.test(text.toLowerCase())) found.push({ text, depth });
        else if (text.toLowerCase() !== keyword.toLowerCase()) related.add(text.toLowerCase());
      }
    }
  };
  await run(firstLevel, 1);
  const level1 = groupQuestions(found, keyword, 12).map((item) => item.question);
  await run(level1, 2);
  return { questions: groupQuestions(found, keyword), related: [...related].slice(0, 20) };
}

export async function researchKeyword(userId: string, siteId: string, keyword: string): Promise<KeywordResearch | null> {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  const term = keyword.replace(/\s+/g, " ").trim().toLowerCase();
  if (term.length < 3 || term.length > 90) throw new Error("Keyword must be 3 to 90 characters");
  const language = (site.language || "en").slice(0, 2).toLowerCase();
  const country = countryFor(language);
  const { questions, related } = await questionTree(term, language);
  const notes: string[] = [];
  let serp: KeywordResearch["serp"] = null;
  if (serpProviderConfigured()) {
    try {
      const { results, pages } = await loadSerpPages(term, country, language);
      const outlines = pages.map((page) => page.outline);
      const brief = { ...buildSerpBrief(outlines, questions.map((item) => item.question)), terms: extractTerms(pages.map((page) => page.text), { keyword: term }) };
      serp = { provider: "brave", results, outlines, brief };
      if (!outlines.length) notes.push("Search results were found but none of the pages could be read.");
    } catch (error) {
      notes.push(error instanceof Error ? error.message : "Search provider failed");
    }
  } else {
    notes.push("SERP brief is off. Set BRAVE_SEARCH_API_KEY (Brave Search API) to read the top results' headings and length.");
  }
  let metrics: KeywordMetrics | null = null;
  if (volumeProviderConfigured()) {
    try { metrics = (await fetchKeywordMetrics([term], language)).get(term) ?? null; } catch (error) { notes.push(error instanceof Error ? error.message : "Volume provider failed"); }
  }
  if (!questions.length) notes.push("No question suggestions found for this keyword.");
  return { keyword: term, questions, related, serp, metrics, notes };
}
