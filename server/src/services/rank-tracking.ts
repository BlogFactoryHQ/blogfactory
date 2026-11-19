// Rank tracking before there is any Search Console data: one Brave Search call per keyword, top 20 organic results.
import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { rankKeywords, sites, userApiKeys } from "../db/schema.js";
import { withProviderKeys } from "./provider-keys.js";
import { countryFor, searchSerp, serpProviderConfigured, type SerpResult } from "./keyword-research.js";

export const RANK_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_TRACKED_PER_SITE = 25;
const MAX_HISTORY = 12;

export interface RankPoint { date: string; position: number | null }

export function hostOf(value: string) {
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
}

export function findPosition(results: SerpResult[], domain: string): { position: number; url: string } | null {
  const host = hostOf(domain);
  if (!host) return null;
  for (let index = 0; index < results.length; index += 1) {
    const resultHost = hostOf(results[index].url);
    if (resultHost === host || resultHost.endsWith(`.${host}`)) return { position: index + 1, url: results[index].url };
  }
  return null;
}

export function appendHistory(history: unknown, point: RankPoint): RankPoint[] {
  const list = (Array.isArray(history) ? history : []).filter((item): item is RankPoint => Boolean(item) && typeof (item as RankPoint).date === "string");
  // One point per day: a second check the same day replaces the first.
  return [...list.filter((item) => item.date !== point.date), point].slice(-MAX_HISTORY);
}

// Positive = moved up. A page that fell out of the top 20 counts as position 21 so the change is visible.
export function rankChange(history: RankPoint[]): number | null {
  if (history.length < 2) return null;
  const value = (point: RankPoint) => point.position ?? 21;
  return value(history[history.length - 2]) - value(history[history.length - 1]);
}

export function normalizeTrackedKeywords(keywords: unknown) {
  const seen = new Set<string>();
  return (Array.isArray(keywords) ? keywords : []).map((item) => String(item ?? "").replace(/\s+/g, " ").trim().toLowerCase())
    .filter((keyword) => keyword.length >= 3 && keyword.length <= 90 && !seen.has(keyword) && seen.add(keyword));
}

async function ownedSite(userId: string, siteId: string) {
  const [site] = await db.select({ id: sites.id, domain: sites.domain, language: sites.language }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId))).limit(1);
  return site || null;
}

export async function listRankings(userId: string, siteId: string) {
  if (!(await ownedSite(userId, siteId))) return null;
  const rows = await db.select().from(rankKeywords).where(and(eq(rankKeywords.userId, userId), eq(rankKeywords.siteId, siteId))).orderBy(asc(rankKeywords.keyword));
  return rows.map((row) => {
    const history = appendHistory(row.history, { date: "", position: null }).filter((point) => point.date);
    return { id: row.id, keyword: row.keyword, position: row.position, url: row.rankingUrl, lastCheckedAt: row.lastCheckedAt, change: rankChange(history), history };
  });
}

export async function trackKeywords(userId: string, siteId: string, keywords: unknown) {
  if (!(await ownedSite(userId, siteId))) return null;
  const wanted = normalizeTrackedKeywords(keywords);
  const existing = await db.select({ keyword: rankKeywords.keyword }).from(rankKeywords).where(and(eq(rankKeywords.userId, userId), eq(rankKeywords.siteId, siteId)));
  const known = new Set(existing.map((row) => row.keyword));
  const fresh = wanted.filter((keyword) => !known.has(keyword)).slice(0, Math.max(0, MAX_TRACKED_PER_SITE - existing.length));
  if (fresh.length) await db.insert(rankKeywords).values(fresh.map((keyword) => ({ userId, siteId, keyword }))).onConflictDoNothing();
  return { added: fresh.length, skipped: wanted.length - fresh.length, limit: MAX_TRACKED_PER_SITE };
}

export async function untrackKeyword(userId: string, siteId: string, keyword: string) {
  const removed = await db.delete(rankKeywords).where(and(eq(rankKeywords.userId, userId), eq(rankKeywords.siteId, siteId), eq(rankKeywords.keyword, keyword.trim().toLowerCase()))).returning({ id: rankKeywords.id });
  return removed.length > 0;
}

async function checkOne(row: typeof rankKeywords.$inferSelect, site: { domain: string; language: string | null }, now: Date) {
  const language = (site.language || "en").slice(0, 2).toLowerCase();
  const results = await searchSerp(row.keyword, countryFor(language), language, { count: 20, fresh: true });
  const found = findPosition(results, site.domain);
  const history = appendHistory(row.history, { date: now.toISOString().slice(0, 10), position: found?.position ?? null });
  await db.update(rankKeywords).set({ position: found?.position ?? null, rankingUrl: found?.url ?? null, history, lastCheckedAt: now }).where(eq(rankKeywords.id, row.id));
  return found?.position ?? null;
}

// Manual checks are capped because every keyword spends one search-provider call.
export function checkRankings(userId: string, siteId: string, limit = 10, now = new Date()) {
  return withProviderKeys(userId, () => checkRankingsScoped(userId, siteId, limit, now));
}

async function checkRankingsScoped(userId: string, siteId: string, limit: number, now: Date) {
  const site = await ownedSite(userId, siteId);
  if (!site) return null;
  if (!serpProviderConfigured()) throw new Error("Add a Brave Search API key in Article Settings to check rankings.");
  const rows = await db.select().from(rankKeywords).where(and(eq(rankKeywords.userId, userId), eq(rankKeywords.siteId, siteId)))
    .orderBy(sql`${rankKeywords.lastCheckedAt} ASC NULLS FIRST`).limit(Math.min(limit, 25));
  let checked = 0;
  for (const row of rows) { await checkOne(row, site, now); checked += 1; }
  return { checked };
}

// Weekly background pass: oldest keywords first, bounded per run so a large account cannot burn the provider quota.
// Each keyword runs with its owner's Brave key, falling back to the operator key. Without an operator key only users who saved one are due.
export async function drainRankChecks(limit = 10, now = new Date()) {
  const operatorKey = Boolean(process.env.BRAVE_SEARCH_API_KEY?.trim());
  const stale = or(isNull(rankKeywords.lastCheckedAt), lt(rankKeywords.lastCheckedAt, new Date(now.getTime() - RANK_RECHECK_MS)));
  const due = await db.select({ row: rankKeywords, domain: sites.domain, language: sites.language }).from(rankKeywords)
    .innerJoin(sites, eq(sites.id, rankKeywords.siteId))
    .leftJoin(userApiKeys, eq(userApiKeys.userId, rankKeywords.userId))
    .where(operatorKey ? stale : and(isNotNull(userApiKeys.braveApiKeyEncrypted), stale))
    .orderBy(sql`${rankKeywords.lastCheckedAt} ASC NULLS FIRST`).limit(limit);
  if (!operatorKey && !due.length) return { checked: 0, skipped: "no_provider" as const };
  let checked = 0;
  for (const { row, domain, language } of due) {
    try {
      await withProviderKeys(row.userId, async () => {
        if (!serpProviderConfigured()) throw new Error("no search key");
        await checkOne(row, { domain, language }, now);
      });
      checked += 1;
    } catch { await db.update(rankKeywords).set({ lastCheckedAt: now }).where(eq(rankKeywords.id, row.id)); }
  }
  return { checked, skipped: null };
}

export async function planKeywordsForSite(userId: string, siteId: string, limit = 15) {
  const { getSeoGrowthPlan } = await import("./seo-growth-plan.js");
  const plan = await getSeoGrowthPlan(userId, siteId);
  return (plan?.items || []).filter((item) => item.actionType === "new_content" && item.keyword).map((item) => item.keyword as string).slice(0, limit);
}
