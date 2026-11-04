// Weekly background re-discovery: stores the best uncovered topics so the panel can say "N new since last check".
import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { sites } from "../db/schema.js";
import { discoverTopics, type TopicCandidate, type TopicIntent } from "./product-seo.js";

export const TOPIC_REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const KEEP = 15;

export interface StoredTopicSuggestions {
  checkedAt: string;
  newCount: number;
  topics: Array<{ keyword: string; intent: TopicIntent; cluster: string; score: number }>;
}

export function buildTopicSuggestions(topics: TopicCandidate[], previous: unknown, now = new Date()): StoredTopicSuggestions {
  const before = new Set(((previous as StoredTopicSuggestions | null)?.topics || []).map((topic) => topic.keyword));
  const best = topics.filter((topic) => !topic.overlap).sort((a, b) => b.score - a.score).slice(0, KEEP)
    .map((topic) => ({ keyword: topic.keyword, intent: topic.intent, cluster: topic.cluster, score: topic.score }));
  return { checkedAt: now.toISOString(), newCount: previous ? best.filter((topic) => !before.has(topic.keyword)).length : best.length, topics: best };
}

export async function refreshSiteTopics(userId: string, siteId: string, previous: unknown) {
  const discovered = await discoverTopics(userId, siteId);
  if (!discovered) return null;
  const suggestions = buildTopicSuggestions(discovered.topics, previous);
  await db.update(sites).set({ topicSuggestions: suggestions, topicSuggestionsCheckedAt: new Date() })
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return suggestions;
}

// Bounded: a few sites per drain, never-checked first. Failures only mark the site as checked so one broken site cannot block the queue.
export async function drainTopicRefresh(limit = 2, now = new Date()) {
  const due = await db.select({ id: sites.id, userId: sites.userId, topicSuggestions: sites.topicSuggestions }).from(sites)
    .where(and(
      isNotNull(sites.productProfile),
      or(isNull(sites.topicSuggestionsCheckedAt), lt(sites.topicSuggestionsCheckedAt, new Date(now.getTime() - TOPIC_REFRESH_INTERVAL_MS))),
    ))
    .orderBy(sql`${sites.topicSuggestionsCheckedAt} ASC NULLS FIRST`).limit(limit);
  const results: Array<{ siteId: string; status: "refreshed" | "failed"; newCount?: number }> = [];
  for (const site of due) {
    try {
      const suggestions = await refreshSiteTopics(site.userId, site.id, site.topicSuggestions);
      results.push({ siteId: site.id, status: "refreshed", newCount: suggestions?.newCount });
    } catch {
      await db.update(sites).set({ topicSuggestionsCheckedAt: new Date() }).where(eq(sites.id, site.id));
      results.push({ siteId: site.id, status: "failed" });
    }
  }
  return results;
}
