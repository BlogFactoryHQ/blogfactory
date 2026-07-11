import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { siteIntegrations, sites } from "../db/schema.js";
import { isOrtakAlanProfile } from "./ortak-alan-publishing.js";

export interface FeedEditorialDefaults {
  profile: "ortak_alan_news" | "generic";
  postType: "post" | "page";
  contentType: string;
  defaultTopicTags: string[];
  defaultTags: string[];
  defaultCategories: string[];
  aiTopicsEnabled: boolean;
}

export function normalizeFeedEditorialDefaults(value: unknown, ortakAlan = false): FeedEditorialDefaults {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {
    profile: ortakAlan ? "ortak_alan_news" : "generic",
    postType: record.postType === "page" ? "page" : "post",
    contentType: ortakAlan ? text(record.contentType) || "Haber" : "",
    defaultTopicTags: list(record.defaultTopicTags, 7),
    defaultTags: list(record.defaultTags, 8),
    defaultCategories: list(record.defaultCategories, 8),
    aiTopicsEnabled: record.aiTopicsEnabled !== false,
  };
}

export async function inspectFeedRouting(userId: string, siteId: string | null, integrationId: string | null, defaultsValue: unknown) {
  const errors: string[] = [];
  const [site] = siteId
    ? await db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, userId))).limit(1)
    : [];
  if (!site) errors.push("Select a destination site");

  const [integration] = integrationId
    ? await db.select().from(siteIntegrations).where(and(eq(siteIntegrations.id, integrationId), eq(siteIntegrations.userId, userId))).limit(1)
    : [];
  if (!integration) errors.push("Select a publishing target");
  else if (!site || integration.siteId !== site.id) errors.push("Publishing target does not belong to the selected site");
  else if (integration.status !== "connected") errors.push("Publishing target is not connected");

  const ortakAlan = Boolean(integration && isOrtakAlanProfile(integration.config));
  const editorialDefaults = normalizeFeedEditorialDefaults(defaultsValue, ortakAlan);
  if (ortakAlan) {
    const config = (integration?.config || {}) as Record<string, unknown>;
    const defaultAuthor = config.defaultAuthor && typeof config.defaultAuthor === "object" ? config.defaultAuthor as Record<string, unknown> : null;
    if (!editorialDefaults.contentType) errors.push("Select an editorial content type");
    if (!defaultAuthor?.id) errors.push("Configure a default Ghost author on the Ortak Alan integration");
    if (!text(config.editorialOwner)) errors.push("Configure the editorial owner on the Ortak Alan integration");
  }

  return {
    valid: errors.length === 0,
    errors,
    site: site || null,
    integration: integration || null,
    editorialDefaults,
    profile: ortakAlan ? "ortak_alan_news" as const : "generic" as const,
  };
}

export function mergeTopicTags(defaultTags: string[], suggestedTags: string[], max = 7) {
  return unique([...defaultTags, ...suggestedTags]).slice(0, max);
}

export function rssPublicationDate(value: string | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export function sanitizeClassifiedTopics(values: unknown[], vocabulary: string[]) {
  const allowed = new Map(unique(vocabulary).map((topic) => [topic.toLocaleLowerCase("tr-TR"), topic]));
  return unique(values.map(text))
    .map((topic) => allowed.get(topic.toLocaleLowerCase("tr-TR")))
    .filter((topic): topic is string => Boolean(topic))
    .slice(0, 3);
}

export async function classifyEditorialTopics(input: { apiKey: string; model: string; title: string; content: string; vocabulary: string[] }) {
  const vocabulary = unique(input.vocabulary).slice(0, 50);
  if (!vocabulary.length) return { topics: [] as string[], warning: null as string | null };
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${input.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: input.model,
        messages: [
          { role: "system", content: "Select zero to three relevant topics only from the supplied vocabulary. Return only JSON." },
          { role: "user", content: `Vocabulary: ${JSON.stringify(vocabulary)}\nTitle: ${input.title}\nArticle: ${input.content.slice(0, 2400)}\nReturn {\"topics\":[\"exact vocabulary label\"]}.` },
        ],
        max_completion_tokens: 120,
        response_format: { type: "json_object" },
      }),
    });
    if (!response.ok) throw new Error(`topic classifier returned ${response.status}`);
    const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const raw = data.choices?.[0]?.message?.content || "{}";
    const parsed = JSON.parse(raw) as { topics?: unknown[] };
    const topics = sanitizeClassifiedTopics(parsed.topics || [], vocabulary);
    return { topics, warning: null };
  } catch (error) {
    return { topics: [], warning: error instanceof Error ? `AI topic suggestions unavailable: ${error.message}` : "AI topic suggestions unavailable" };
  }
}

function list(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  return unique(value.map(text)).slice(0, max);
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const cleaned = text(value);
    if (!cleaned) return false;
    const key = cleaned.toLocaleLowerCase("tr-TR");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map(text);
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}
