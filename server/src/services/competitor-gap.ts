// Competitor content gap from a public sitemap. Reads URLs only (no page fetches), so it is cheap and polite.
import { isBlockedHostname, isPrivateAddress, publicFetchText } from "./public-fetch.js";
import {
  classifyIntent, clusterKeywords, existingSiteTitles, ownedSiteRow, productFit, topicSimilarity,
  type ProductProfile, type TopicIntent,
} from "./product-seo.js";

const MAX_URLS = 3000;
const MAX_CHILD_SITEMAPS = 6;
const GAP_THRESHOLD = 0.4;
const CONTENT_PATH = /\/(blog|articles?|guides?|resources?|learn|posts?|news|insights|academy|tutorials?)\//i;
const NOISE_PATH = /\/(tag|tags|category|categories|author|authors|page|feed|wp-json|cart|checkout|login|signup|account)\b/i;

export interface CompetitorTopic { url: string; topic: string }
export interface GapTopic {
  topic: string;
  url: string;
  intent: TopicIntent;
  fit: number;
  cluster: string;
  closestOwn: { title: string; similarity: number } | null;
}
export interface CompetitorGap {
  competitor: string;
  sitemapUrls: number;
  contentUrls: number;
  covered: number;
  gaps: GapTopic[];
  notes: string[];
}

// ── pure helpers ──

export function normalizeCompetitorDomain(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Competitor domain is required");
  const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("Only http and https competitors are allowed");
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (isBlockedHostname(host) || !host.includes(".") || (/^[\d.]+$|:/.test(host) && isPrivateAddress(host))) throw new Error("Competitor must be a public domain");
  return parsed.origin;
}

export function parseSitemapXml(xml: string) {
  const locs = [...xml.matchAll(/<loc[^>]*>([\s\S]*?)<\/loc>/gi)].map((match) =>
    match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").trim()).filter(Boolean);
  return { isIndex: /<sitemapindex[\s>]/i.test(xml), locs };
}

export function topicFromUrl(url: string): string | null {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (NOISE_PATH.test(parsed.pathname)) return null;
  const segments = parsed.pathname.split("/").filter(Boolean);
  const slug = segments.at(-1) || "";
  const words = slug.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\d{4,}\b/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const isContent = CONTENT_PATH.test(parsed.pathname) || words.length >= 4;
  if (!isContent || words.length < 2 || words.length > 14) return null;
  return words.join(" ").toLowerCase();
}

export function computeGap(
  competitorTopics: CompetitorTopic[],
  ownTitles: string[],
  profile: Pick<ProductProfile, "features" | "problems" | "audience" | "seedTopics" | "competitors"> | null,
  limit = 40,
): { covered: number; gaps: GapTopic[] } {
  const unique = new Map<string, CompetitorTopic>();
  for (const item of competitorTopics) if (!unique.has(item.topic)) unique.set(item.topic, item);
  const gaps: GapTopic[] = [];
  let covered = 0;
  for (const item of unique.values()) {
    let closest: GapTopic["closestOwn"] = null;
    for (const title of ownTitles) {
      const similarity = topicSimilarity(item.topic, title);
      if (!closest || similarity > closest.similarity) closest = { title, similarity: Math.round(similarity * 100) / 100 };
    }
    if (closest && closest.similarity >= GAP_THRESHOLD) { covered += 1; continue; }
    gaps.push({
      topic: item.topic, url: item.url, intent: classifyIntent(item.topic),
      fit: profile ? Math.round(productFit(item.topic, profile) * 100) / 100 : 0.5,
      cluster: item.topic, closestOwn: closest && closest.similarity > 0 ? closest : null,
    });
  }
  const clusters = clusterKeywords(gaps.map((gap) => gap.topic));
  const labelOf = new Map<string, string>();
  for (const cluster of clusters) for (const member of cluster.members) labelOf.set(member, cluster.label);
  for (const gap of gaps) gap.cluster = labelOf.get(gap.topic) || gap.topic;
  // Products fit first; ties prefer topics the competitor covers in a cluster (more evidence of demand).
  const clusterSize = new Map<string, number>();
  for (const gap of gaps) clusterSize.set(gap.cluster, (clusterSize.get(gap.cluster) || 0) + 1);
  gaps.sort((a, b) => (b.fit - a.fit) || ((clusterSize.get(b.cluster) || 0) - (clusterSize.get(a.cluster) || 0)));
  return { covered, gaps: gaps.slice(0, limit) };
}

// ── network ──

async function fetchXml(url: string) {
  const page = await publicFetchText(url, { accept: "application/xml,text/xml,text/plain,*/*", maxBytes: 5_000_000 });
  return page?.text ?? null;
}

export async function sitemapUrls(origin: string) {
  const candidates: string[] = [];
  const robots = await fetchXml(`${origin}/robots.txt`);
  for (const match of robots?.matchAll(/^sitemap:\s*(\S+)/gim) || []) candidates.push(match[1]);
  candidates.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`);
  const urls: string[] = [];
  const queue = [...new Set(candidates)];
  let children = 0;
  const seen = new Set<string>();
  while (queue.length && urls.length < MAX_URLS) {
    const next = queue.shift()!;
    if (seen.has(next)) continue;
    seen.add(next);
    const xml = await fetchXml(next);
    if (!xml) continue;
    const { isIndex, locs } = parseSitemapXml(xml);
    if (isIndex) {
      // Prefer post/blog sitemaps; product and image sitemaps rarely hold editorial topics.
      const ranked = [...locs].sort((a, b) => Number(/post|blog|article|news/i.test(b)) - Number(/post|blog|article|news/i.test(a)));
      for (const child of ranked) { if (children >= MAX_CHILD_SITEMAPS) break; children += 1; queue.push(child); }
    } else urls.push(...locs);
    if (urls.length > 0 && queue.every((item) => !/sitemap/i.test(item))) break;
  }
  return urls.slice(0, MAX_URLS);
}

export async function findContentGaps(userId: string, siteId: string, competitor: string): Promise<CompetitorGap | null> {
  const site = await ownedSiteRow(userId, siteId);
  if (!site) return null;
  const origin = normalizeCompetitorDomain(competitor);
  const own = (site.domain || "").toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  if (new URL(origin).hostname.replace(/^www\./, "") === own) throw new Error("Pick a competitor, not your own site");
  const urls = await sitemapUrls(origin);
  const notes: string[] = [];
  if (!urls.length) notes.push("No readable sitemap found at robots.txt, /sitemap.xml or /sitemap_index.xml.");
  const topics = urls.flatMap((url) => { const topic = topicFromUrl(url); return topic ? [{ url, topic }] : []; });
  if (urls.length && !topics.length) notes.push("The sitemap has no blog-style URLs to compare.");
  const ownTitles = await existingSiteTitles(userId, siteId, site);
  const profile = (site.productProfile as ProductProfile | null) ?? null;
  if (!profile) notes.push("Generate the product profile for better product-fit ranking.");
  const { covered, gaps } = computeGap(topics, ownTitles, profile);
  return { competitor: origin, sitemapUrls: urls.length, contentUrls: topics.length, covered, gaps, notes };
}
