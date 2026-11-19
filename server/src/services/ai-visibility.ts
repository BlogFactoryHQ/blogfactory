// "Do AI answers mention or cite us?" Asks a web-search-enabled model a few buyer questions and records the answer.
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sites } from "../db/schema.js";
import { openRouterInferenceFetch, resolveOpenRouterAccess } from "./managed-openrouter.js";
import { hostOf } from "./rank-tracking.js";
import type { ProductProfile } from "./product-seo.js";

const MODEL = "google/gemini-3.5-flash";
const MAX_PROMPTS = 5;

export interface Citation { url: string; title: string }
export interface VisibilityResult { prompt: string; mentioned: boolean; cited: boolean; competitors: string[]; citations: Citation[]; error?: string }
export interface AiVisibility { checkedAt: string; model: string; results: VisibilityResult[]; mentionRate: number; citationRate: number }

const TEMPLATES: Record<string, { best: (seed: string) => string; alt: (rival: string) => string; how: (seed: string) => string }> = {
  en: { best: (seed) => `What are the best ${seed}?`, alt: (rival) => `What are the best alternatives to ${rival}?`, how: (seed) => `How do I choose ${seed}?` },
  tr: { best: (seed) => `En iyi ${seed} hangileri?`, alt: (rival) => `${rival} alternatifleri nelerdir?`, how: (seed) => `${seed} nasıl seçilir?` },
};

export function defaultVisibilityPrompts(profile: Pick<ProductProfile, "seedTopics" | "competitors">, language: string | null) {
  const t = TEMPLATES[(language || "en").slice(0, 2).toLowerCase()] || TEMPLATES.en;
  const prompts = [
    ...profile.seedTopics.slice(0, 2).map(t.best),
    ...profile.competitors.slice(0, 2).map(t.alt),
    ...profile.seedTopics.slice(2, 3).map(t.how),
  ];
  return [...new Set(prompts)].slice(0, MAX_PROMPTS);
}

export function parseChatAnswer(data: unknown): { text: string; citations: Citation[] } {
  const message = (data as { choices?: Array<{ message?: { content?: unknown; annotations?: unknown } }> } | null)?.choices?.[0]?.message;
  const text = typeof message?.content === "string" ? message.content : "";
  const citations: Citation[] = [];
  const seen = new Set<string>();
  for (const annotation of Array.isArray(message?.annotations) ? message.annotations as Array<{ type?: string; url_citation?: { url?: string; title?: string } }> : []) {
    const url = annotation?.type === "url_citation" ? annotation.url_citation?.url : undefined;
    if (url && !seen.has(url)) { seen.add(url); citations.push({ url, title: String(annotation.url_citation?.title || "").slice(0, 120) }); }
  }
  return { text, citations: citations.slice(0, 10) };
}

export function evaluateAnswer(prompt: string, answer: { text: string; citations: Citation[] }, brand: string, domain: string, competitors: string[]): VisibilityResult {
  const text = answer.text.toLowerCase();
  const host = hostOf(domain);
  const brandName = brand.trim().toLowerCase();
  const cited = Boolean(host) && answer.citations.some((citation) => {
    const citationHost = hostOf(citation.url);
    return citationHost === host || citationHost.endsWith(`.${host}`);
  });
  const mentioned = cited || (brandName.length >= 3 && text.includes(brandName)) || (Boolean(host) && text.includes(host));
  return {
    prompt, mentioned, cited,
    competitors: competitors.filter((name) => name.length >= 3 && text.includes(name.toLowerCase())),
    citations: answer.citations.slice(0, 8),
  };
}

export function summarizeVisibility(results: VisibilityResult[]) {
  const answered = results.filter((result) => !result.error);
  const rate = (count: number) => answered.length ? Math.round((count / answered.length) * 100) : 0;
  return { mentionRate: rate(answered.filter((result) => result.mentioned).length), citationRate: rate(answered.filter((result) => result.cited).length) };
}

export async function getAiVisibility(userId: string, siteId: string) {
  const [site] = await db.select({ aiVisibility: sites.aiVisibility }).from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, userId))).limit(1);
  return site ? { visibility: (site.aiVisibility as AiVisibility | null) ?? null } : null;
}

// Each prompt costs model tokens plus a web-search fee, so this only runs on an explicit request, capped at five prompts.
export async function checkAiVisibility(userId: string, siteId: string, prompts?: unknown) {
  const [site] = await db.select().from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, userId))).limit(1);
  if (!site) return null;
  const profile = site.productProfile as ProductProfile | null;
  const list = (Array.isArray(prompts) ? prompts : []).map((item) => String(item ?? "").replace(/\s+/g, " ").trim().slice(0, 200)).filter((item) => item.length >= 8).slice(0, MAX_PROMPTS);
  const finalPrompts = list.length ? list : profile ? defaultVisibilityPrompts(profile, site.language) : [];
  if (!finalPrompts.length) throw new Error("Generate the product profile first, or enter your own questions.");
  await resolveOpenRouterAccess(userId);
  const competitors = profile?.competitors || [];
  const results: VisibilityResult[] = [];
  for (const prompt of finalPrompts) {
    try {
      const response = await openRouterInferenceFetch(userId, "https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, plugins: [{ id: "web" }], messages: [{ role: "user", content: prompt }] }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`Model returned ${response.status}`);
      results.push(evaluateAnswer(prompt, parseChatAnswer(await response.json()), site.name, site.domain, competitors));
    } catch (error) {
      results.push({ prompt, mentioned: false, cited: false, competitors: [], citations: [], error: error instanceof Error ? error.message.slice(0, 160) : "Check failed" });
    }
  }
  const visibility: AiVisibility = { checkedAt: new Date().toISOString(), model: MODEL, results, ...summarizeVisibility(results) };
  await db.update(sites).set({ aiVisibility: visibility, aiVisibilityCheckedAt: new Date() }).where(and(eq(sites.id, siteId), eq(sites.userId, userId)));
  return visibility;
}
