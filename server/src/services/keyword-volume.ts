// Real search volume from DataForSEO (Google Ads data) when the operator configured credentials.
// One request per discovery run, cached per keyword for a day. Without credentials nothing changes.
import { INTENT_WEIGHT, type TopicCandidate } from "./product-seo.js";
import { createTtlCache } from "./ttl-cache.js";

export interface KeywordMetrics { volume: number | null; competition: string | null; cpc: number | null }

const ENDPOINT = "https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live";
const MAX_KEYWORDS = 60;
const metricsCache = createTtlCache<KeywordMetrics>(24 * 60 * 60 * 1000, 3000);
const OVERLAP_PENALTY = 40;

// DataForSEO location codes for the languages the app supports best. Others fall back to worldwide data.
const LOCATION_BY_LANGUAGE: Record<string, number> = { en: 2840, tr: 2792, de: 2276, fr: 2250, es: 2724, it: 2380 };

export function volumeProviderConfigured() {
  return Boolean(process.env.DATAFORSEO_LOGIN?.trim() && process.env.DATAFORSEO_PASSWORD?.trim());
}

export function parseVolumeResponse(data: unknown): Map<string, KeywordMetrics> {
  const out = new Map<string, KeywordMetrics>();
  const tasks = (data as { tasks?: Array<{ status_code?: number; result?: unknown }> } | null)?.tasks;
  for (const task of Array.isArray(tasks) ? tasks : []) {
    if (task.status_code !== 20000 || !Array.isArray(task.result)) continue;
    for (const row of task.result as Array<Record<string, unknown>>) {
      const keyword = typeof row.keyword === "string" ? row.keyword.toLowerCase() : "";
      if (!keyword) continue;
      out.set(keyword, {
        volume: typeof row.search_volume === "number" ? row.search_volume : null,
        competition: typeof row.competition === "string" ? row.competition : null,
        cpc: typeof row.cpc === "number" ? row.cpc : null,
      });
    }
  }
  return out;
}

export async function fetchKeywordMetrics(keywords: string[], language: string): Promise<Map<string, KeywordMetrics>> {
  const result = new Map<string, KeywordMetrics>();
  if (!volumeProviderConfigured()) return result;
  const wanted = [...new Set(keywords.map((keyword) => keyword.toLowerCase().trim()).filter((keyword) => keyword && keyword.length <= 80 && keyword.split(/\s+/).length <= 10))].slice(0, MAX_KEYWORDS);
  const missing: string[] = [];
  for (const keyword of wanted) {
    const hit = metricsCache.get(`${language}:${keyword}`);
    if (hit) result.set(keyword, hit); else missing.push(keyword);
  }
  if (!missing.length) return result;
  const auth = Buffer.from(`${process.env.DATAFORSEO_LOGIN}:${process.env.DATAFORSEO_PASSWORD}`).toString("base64");
  const location = LOCATION_BY_LANGUAGE[language];
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify([{ keywords: missing, language_code: language, ...(location ? { location_code: location } : {}) }]),
    signal: AbortSignal.timeout(20_000),
  }).catch(() => null);
  if (!response?.ok) throw new Error(`Volume provider returned ${response?.status ?? "no response"}`);
  const parsed = parseVolumeResponse(await response.json().catch(() => null));
  for (const keyword of missing) {
    // Keywords Google Ads has no data for come back absent; cache the miss so reruns do not pay for it again.
    const metrics = parsed.get(keyword) ?? { volume: null, competition: null, cpc: null };
    metricsCache.set(`${language}:${keyword}`, metrics);
    result.set(keyword, metrics);
  }
  return result;
}

// Replaces the autocomplete demand proxy with real volume (log scale: 100k searches per month is the ceiling).
export function rescoreWithVolume(topics: TopicCandidate[], metrics: Map<string, KeywordMetrics>): TopicCandidate[] {
  return topics.map((topic) => {
    const found = metrics.get(topic.keyword.toLowerCase());
    if (!found) return topic;
    const withMetrics = { ...topic, volume: found.volume, competition: found.competition };
    if (found.volume === null) return withMetrics;
    const demand = Math.min(1, Math.log10(found.volume + 1) / 5);
    const base = Math.round((demand * 0.4 + topic.fit * 0.4 + INTENT_WEIGHT[topic.intent] * 0.2) * 100);
    return { ...withMetrics, score: topic.overlap ? Math.max(0, base - OVERLAP_PENALTY) : base };
  }).sort((a, b) => b.score - a.score);
}
