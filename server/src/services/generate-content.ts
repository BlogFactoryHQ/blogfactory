import { db } from "../db/index.js";
import { campaignItems, imageAssets, imageGenerationRequests, jobs, posts, feeds, generationLogs, personas, userSettings } from "../db/schema.js";
import { eq, and, inArray, sql } from "drizzle-orm";
import { saveImageBuffer } from "./image-storage.js";
import { getOpenRouterKey } from "./api-keys.js";
import { extractContent } from "./extract-content.js";
import { kickDeferredImageWorker, resolveLowCostImages, type ImageResolutionResult } from "./low-cost-images.js";
import {
  assertOpenRouterModelAvailable,
  getOpenRouterModels,
  normalizeOpenRouterImageModelId,
  openRouterImageResolution,
  resolveOpenRouterTextModel,
} from "./openrouter-models.js";
import { cleanGeneratedPostContent, cleanPostTitle } from "./post-cleanup.js";
import { slugify } from "./publishing.js";
import { retrieveKnowledgeChunks } from "./knowledge.js";
import { buildVoiceContentInstructions } from "./voice-content.js";
import { getEffectiveSettings, getGlobalSettings, updateGlobalSettings } from "./user-settings.js";
import type { CampaignMode, OutlineHeading } from "./campaign-parser.js";
import { buildSportsNewsInstructions, classifySportsNews, sportsMatrixRowsFromSettings, type SportsNewsDecision } from "./sports-news.js";
import { fetchSocialContent } from "./fetch-social-content.js";
import { imageTargets } from "./image-slots.js";

interface GenerateOpts {
  userId: string;
  sourceType: string;
  sourceValue: string;
  modelId?: string;
  personaId?: string | null;
  variations?: number;
  postsPerRun?: number;
  feedItemOffset?: number;
  filterType?: string;
  filterValue?: number | null;
  keywords?: string[] | string | null;
  draftBatchId?: string;
  draftVariationIndex?: number;
  draftVariationCount?: number;
  feedId?: string;
  extractFullContent?: boolean;
  filterOldPostsDays?: number;
  platformConfig?: any;
  generateImages?: boolean;
  imageConfig?: any;
  imageDeliveryMode?: string;
  manualImageProvider?: string;
  relatedKeywords?: string[] | string;
  outline?: string;
  articleDirection?: string;
  customInstructions?: string;
  articleType?: string;
  articleTitleOverride?: string;
  articleWordCount?: number | string;
  includeTableOfContents?: boolean;
  enableResearch?: boolean;
  internalLinkDensity?: string;
  jobId?: string; // for retry
  schedulerUserId?: string;
  campaignId?: string | null;
  campaignItemId?: string | null;
  settingsSnapshot?: any;
  campaignArticle?: {
    mode: CampaignMode;
    keyword?: string | null;
    title?: string | null;
    outline?: OutlineHeading[] | null;
    sharedContext?: string | null;
    programmatic?: {
      templateName: string;
      variables: Record<string, string>;
      sections: Array<{
        type: string;
        heading: string;
        instructions: string;
        minWords?: number;
        maxWords?: number;
        snippable?: boolean;
      }>;
      wordRange?: [number, number];
    };
  };
}

type UserSettingsRecord = typeof userSettings.$inferSelect;
type GenerationSettings = Partial<UserSettingsRecord> & Record<string, any>;
type SourceArticle = { title: string; content: string; url?: string; hash?: string; pubDate?: string; sportsDecision?: SportsNewsDecision; variationIndex?: number; variationCount?: number };
type SeoQaCheck = { label: string; ok: boolean | null; detail: string };
type GenerationContract = ReturnType<typeof resolveGenerationContract>;
export type SeoPackage = {
  slug: string;
  metaTitle: string;
  metaDescription: string;
  keyPoints?: string[];
  faqs: Array<{ question: string; answer: string; sourceQuery?: string }>;
};

type ImageDeliveryMode = "generate" | "manual_prompt";
type ManualImageProvider = "midjourney";

function summarizeImageResolution(result: ImageResolutionResult) {
  return {
    coverPath: result.coverPath,
    inlinePaths: result.inlinePaths,
    queued: result.queued,
    failed: result.failed,
    results: result.results.map((item) => ({
      type: item.slot.type,
      position: item.slot.position,
      status: item.status,
      storagePath: item.storagePath,
      provider: item.provider,
      queuedRequestId: item.queuedRequestId,
      query: item.query,
      error: item.error,
    })),
  };
}

type ManualPromptRequestSlot = {
  id: string | null;
  type: "cover" | "inline";
  position: number;
};

export function manualPromptImageResolutionSummary(requests: ManualPromptRequestSlot[], provider: ManualImageProvider = "midjourney"): ReturnType<typeof summarizeImageResolution> {
  return {
    coverPath: null,
    inlinePaths: [],
    queued: requests.length,
    failed: 0,
    results: requests.map((request) => ({
      type: request.type,
      position: request.position,
      status: "queued" as const,
      storagePath: undefined,
      provider,
      queuedRequestId: request.id || undefined,
      query: undefined,
      error: undefined,
    })),
  };
}

const AI_REQUEST_TIMEOUT_MS = 35_000;
const MANUAL_PROMPT_SYNC_TIMEOUT_MS = 12_000;
const IMAGE_REQUEST_TIMEOUT_MS = 45_000;
const JOB_SYNC_BUDGET_MS = 52_000;
const RSS_FETCH_TIMEOUT_MS = 15_000;
const OPENROUTER_COST_LOOKUP_DELAY_MS = 900;
const OPENROUTER_COST_LOOKUP_TIMEOUT_MS = 4_000;
const SEO_META_TITLE_LIMIT = 60;
const SEO_META_DESCRIPTION_LIMIT = 145;
const ARTICLE_TYPES = new Set(["auto", "how_to", "list", "what_is", "pillar", "alternatives", "best_of", "comparison", "newsjacking"]);
const BLOG_DRAFT_SOURCE_TYPES = new Set(["article_keyword", "article_title", "url", "raw_text", "youtube", "pdf", "rss_feed", "reddit", "hackernews", "github", "campaign"]);
const FEED_SOURCE_TYPES = new Set(["rss_feed", "reddit", "hackernews", "github"]);

function hasJobSyncBudget(startedAt: number, requiredMs: number) {
  return JOB_SYNC_BUDGET_MS - (Date.now() - startedAt) >= requiredMs;
}
const FAQ_TARGET: [number, number] = [3, 5];
const INTERNAL_LINK_TARGETS: Record<string, [number, number]> = {
  minimal: [1, 2],
  light: [3, 4],
  balanced: [5, 7],
  rich: [8, 12],
};

export function openRouterImageModelId(modelId: string | null | undefined) {
  return normalizeOpenRouterImageModelId(modelId);
}

async function validateImageModelForRequest(openRouterKey: string | null, modelId: string, type: string) {
  if (!openRouterKey) throw new Error("Add your OpenRouter API key in Settings before using AI image models");
  const fallback = (await getOpenRouterModels(openRouterKey, "image"))[0]?.id;
  if (modelId) {
    try {
      await assertOpenRouterModelAvailable(openRouterKey, modelId, "image");
      return modelId;
    } catch {
      if (fallback) return fallback;
      throw new Error(`Selected image model is unavailable and no OpenRouter image fallback exists for ${type} images`);
    }
  }
  if (!fallback) throw new Error(`No OpenRouter image model is available for ${type} images`);
  return fallback;
}

function truncatePromptText(value: string, maxChars = 1200) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}...`;
}

function summarizeJsonList(value: unknown, maxItems = 5) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (item && typeof item === "object") {
        const record = item as Record<string, unknown>;
        return [record.title, record.label, record.description, record.content, record.url]
          .filter((part) => typeof part === "string" && part.trim())
          .map((part) => truncatePromptText(part as string))
          .join(" — ");
      }
      return "";
    })
    .filter(Boolean)
    .slice(0, maxItems);
}

function brandMentionInstruction(value: string, companyName?: string) {
  const brand = companyName?.trim() || "the brand";
  switch (value.toLowerCase()) {
    case "subtle":
      return `Brand mention guidance: Keep ${brand} subtle. Mention it at most once, only when directly relevant to the source. Do not force a pitch or CTA.`;
    case "moderate":
      return `Brand mention guidance: Weave ${brand} into 2-3 relevant examples or practical takeaways when natural. Keep the article useful first and avoid sounding like an ad.`;
    case "prominent":
      return `Brand mention guidance: Make ${brand} a recurring lens throughout the article with practical examples and a clear CTA when appropriate, while still grounding claims in the source.`;
    default:
      return `Brand mention guidance: ${value}.`;
  }
}

export function openRouterErrorMessage(value: string, status?: number, modelId?: string): string {
  try {
    const parsed = JSON.parse(value) as {
      error?: { message?: string; metadata?: { raw?: string; provider_name?: string } };
      message?: string;
    };
    const message = parsed.error?.message || parsed.message || value;
    const raw = parsed.error?.metadata?.raw;
    const provider = parsed.error?.metadata?.provider_name;
    const rawMessage: string = raw && raw !== value ? openRouterErrorMessage(raw) : "";
    const details: string = rawMessage && rawMessage !== message ? ` — ${truncatePromptText(rawMessage, 300)}` : "";
    const prefix = modelId ? `${modelId}: ` : "";
    const statusText = status ? `HTTP ${status}` : "provider error";
    if (/^provider returned error$/i.test(message)) {
      return `${prefix}${provider ? `${provider} ` : ""}${statusText}${details}`;
    }
    return `${prefix}${message}${details}`;
  } catch {
    const prefix = modelId ? `${modelId}: ` : "";
    const statusText = status ? `HTTP ${status}: ` : "";
    return `${prefix}${statusText}${value}`;
  }
}

function generationErrorMessage(err: any) {
  if (err?.name === "AbortError" || err?.name === "TimeoutError") {
    return "AI provider timed out before content was created. Try again with a faster model or shorter source.";
  }
  return err?.message || "Draft generation failed";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const numberOrZero = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

async function getOpenRouterCost(openRouterKey: string, responseData: any) {
  let stats: any = null;

  if (responseData?.id) {
    try {
      await sleep(OPENROUTER_COST_LOOKUP_DELAY_MS);
      const resp = await fetch(`https://openrouter.ai/api/v1/generation?id=${encodeURIComponent(responseData.id)}`, {
        signal: AbortSignal.timeout(OPENROUTER_COST_LOOKUP_TIMEOUT_MS),
        headers: { Authorization: `Bearer ${openRouterKey}` },
      });
      if (resp.ok) stats = ((await resp.json()) as any).data;
    } catch (err) {
      console.warn("[openrouter] Cost lookup failed:", err);
    }
  }

  return {
    stats,
    cost: numberOrZero(stats?.total_cost ?? responseData?.usage?.total_cost ?? responseData?.usage?.cost ?? responseData?.usage),
  };
}

function tokenize(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi) || []);
}

type InternalLinkPromptPage = { url?: string; title?: string; description?: string; path?: string; embedding?: number[] };

function normalizeTopic(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function topicCoveredByText(topic: string, text: string) {
  const normalizedTopic = normalizeTopic(topic);
  const normalizedText = normalizeTopic(text);
  return normalizedTopic.length >= 8 && normalizedText.includes(normalizedTopic);
}

export function findIndexedTopicDuplicate(settings: GenerationSettings | undefined, topic: string) {
  const index = settingValue(settings, "internalLinkIndex", "internal_link_index") as { pages?: InternalLinkPromptPage[] } | null | undefined;
  const pages = Array.isArray(index?.pages) ? index.pages : [];
  return pages.find((page) => topicCoveredByText(topic, `${page.title || ""} ${page.path || ""} ${page.url || ""}`)) || null;
}

async function findExistingTopicDuplicate(userId: string, topic: string, sourceRef?: string | null) {
  if (sourceRef) {
    const [sameSource] = await db.select({ id: posts.id, title: posts.title }).from(posts)
      .where(and(eq(posts.userId, userId), eq(posts.sourceRefId, sourceRef)))
      .limit(1);
    if (sameSource) return sameSource.title || "existing draft";
  }

  const rows = await db.select({ title: posts.title }).from(posts).where(eq(posts.userId, userId)).limit(200);
  return rows.find((row) => topicCoveredByText(topic, row.title || ""))?.title || null;
}

function lexicalInternalLinkPages(pages: InternalLinkPromptPage[], sourceText: string) {
  const sourceTokens = tokenize(sourceText);
  return pages
    .map((page) => {
      const haystack = `${page.title || ""} ${page.description || ""} ${page.path || ""}`;
      const pageTokens = tokenize(haystack);
      let score = 0;
      for (const token of pageTokens) {
        if (sourceTokens.has(token)) score += token.length > 4 ? 2 : 1;
      }
      return { page, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ page }) => page);
}

function promptSpecifiesLanguage(prompt: string) {
  return /\b(?:write|respond|answer)\s+in\b|(?:language|dil)\s*:|t[üu]rk[çc]e|turkish|english|ingilizce|spanish|espa[ñn]ol|french|fran[çc]ais|german|deutsch|italian|italiano|portuguese|portugu[eê]s|arabic|العربية/i.test(prompt);
}

function languageFromPrompt(prompt: string) {
  if (/t[üu]rk[çc]e|turkish/i.test(prompt)) return "Turkish";
  if (/us english|american english/i.test(prompt)) return "US English";
  if (/uk english|british english/i.test(prompt)) return "UK English";
  if (/english|ingilizce/i.test(prompt)) return "English";
  if (/german|deutsch/i.test(prompt)) return "German";
  if (/french|fran[çc]ais/i.test(prompt)) return "French";
  if (/spanish|espa[ñn]ol/i.test(prompt)) return "Spanish";
  return "";
}

function requestedOutputLanguage(personaPrompt: string, settings?: GenerationSettings) {
  const personaLanguage = languageFromPrompt(personaPrompt);
  if (personaLanguage) return personaLanguage;
  return String(settingValue(settings, "articleLanguage", "article_language") || "").trim();
}

function outputLanguageInstruction(language: string) {
  if (!language) return "";
  if (/turkish|türkçe/i.test(language)) {
    return "Output language: Turkish. Write the entire article in natural Turkish, including the H1, headings, body, conclusion, and FAQ text.";
  }
  return `Output language: ${language}. Write the entire article in ${language}, including headings and FAQ text.`;
}

function looksLikeRequestedLanguage(content: string, language: string) {
  if (!language) return true;
  if (/turkish|türkçe/i.test(language)) {
    const text = plainText(content, 20_000).toLowerCase();
    const hasTurkishChars = /[ğüşöçıİĞÜŞÖÇ]/.test(content);
    const turkishWords = text.match(/\b(ve|bir|bu|için|ile|olarak|daha|gibi|de|da|olan|sonra|önemli|neden|nasıl)\b/g)?.length || 0;
    const englishWords = text.match(/\b(the|and|with|for|this|that|from|what|why|how|should|will|can)\b/g)?.length || 0;
    return hasTurkishChars || (turkishWords >= 8 && turkishWords >= englishWords);
  }
  return true;
}

function personaLanguagePriorityInstruction(personaPrompt: string) {
  if (!promptSpecifiesLanguage(personaPrompt)) return "";
  return "\n\nPersona language priority: The selected writer persona explicitly defines the output language. Follow that persona language instruction exactly, even if global article settings have a different default language.";
}

export function buildSettingsInstructions(settings?: GenerationSettings, sourceText = "", opts: { includeArticleLanguage?: boolean } = {}) {
  if (!settings) return "";

  const instructions: string[] = [];

  const articleLanguage = String(settingValue(settings, "articleLanguage", "article_language") || "").trim();
  if (articleLanguage && opts.includeArticleLanguage !== false) instructions.push(`Write in ${articleLanguage}.`);
  instructions.push(...buildVoiceContentInstructions(settings));
  const customInstructions = String(settingValue(settings, "customInstructions", "custom_instructions") || settingValue(settings, "customArticleInstructions", "custom_article_instructions") || "").trim();
  if (customInstructions) instructions.push(`Campaign instructions: ${truncatePromptText(customInstructions, 1000)}.`);

  const brand: string[] = [];
  const brandCompanyName = String(settingValue(settings, "brandCompanyName", "brand_company_name") || "").trim();
  const brandDescription = String(settingValue(settings, "brandDescription", "brand_description") || "").trim();
  const brandTargetAudience = String(settingValue(settings, "brandTargetAudience", "brand_target_audience") || "").trim();
  const brandMentions = String(settingValue(settings, "brandMentions", "brand_mentions") || "").trim();
  if (brandCompanyName) brand.push(`Company name: ${brandCompanyName}`);
  if (brandDescription) brand.push(`What the company does: ${truncatePromptText(brandDescription, 500)}`);
  if (brandTargetAudience) brand.push(`Target reader: ${truncatePromptText(brandTargetAudience, 300)}. Write for this audience's needs, assumptions, and decision criteria.`);
  if (brandMentions) brand.push(brandMentionInstruction(brandMentions, brandCompanyName));

  const valueProps = summarizeJsonList(settingValue(settings, "brandValueProps", "brand_value_props"), 5);
  if (valueProps.length) brand.push(`Value propositions: ${valueProps.join("; ")}`);

  const ctas = summarizeJsonList(settingValue(settings, "brandCtas", "brand_ctas"), 2);
  if (ctas.length) brand.push(`Calls to action to weave in when natural: ${ctas.join("; ")}`);

  const knowledgeDocuments = settingValue(settings, "knowledgeDocuments", "knowledge_documents");
  const knowledge = settingBool(settings, "knowledgeBaseEnabled", "knowledge_base_enabled") ? retrieveKnowledgeChunks(knowledgeDocuments, sourceText, 4) : [];
  if (knowledge.length) brand.push(`Knowledge context to use when relevant. Treat these as saved facts/templates, not suggestions to invent beyond:\n${knowledge.map((line) => `  - ${truncatePromptText(line, 600)}`).join("\n")}`);

  if (brand.length) {
    instructions.push(`Brand context:\n${brand.map((line) => `- ${line}`).join("\n")}`);
  }

  return instructions.length
    ? `\n\nWriting context:\n${instructions.map((line) => `- ${line}`).join("\n")}`
    : "";
}

function isArticleSource(sourceType: string) {
  return sourceType === "article_keyword" || sourceType === "article_title";
}

function supportsDraftVariations(sourceType: string) {
  return ["article_keyword", "article_title", "url", "raw_text", "youtube", "pdf"].includes(sourceType);
}

function isFeedSource(sourceType: string) {
  return FEED_SOURCE_TYPES.has(sourceType);
}

function variationCount(value: unknown) {
  const count = Math.round(Number(value));
  return Number.isFinite(count) ? Math.max(1, Math.min(count, 5)) : 1;
}

export function feedSourceItemCount(value: unknown) {
  const count = Math.round(Number(value));
  return Number.isFinite(count) ? Math.max(1, Math.min(count, 20)) : 5;
}

export function feedCandidateItemCount(requested: number) {
  return Math.max(requested, Math.min(50, requested * 4));
}

function feedItemOffset(value: unknown) {
  const offset = Math.floor(Number(value));
  return Number.isFinite(offset) && offset > 0 ? Math.min(offset, 100) : 0;
}

export function expandDraftVariations(
  articles: SourceArticle[],
  sourceType: string,
  requested: unknown,
  singleDraft?: { index?: number; count?: number }
) {
  if (singleDraft?.count && singleDraft.count > 1 && singleDraft.index) {
    return articles.slice(0, 1).map((article) => ({
      ...article,
      variationIndex: singleDraft.index,
      variationCount: singleDraft.count,
    }));
  }
  const count = supportsDraftVariations(sourceType) ? variationCount(requested) : 1;
  if (count <= 1) return articles;
  return articles.flatMap((article) =>
    Array.from({ length: count }, (_, index) => ({
      ...article,
      variationIndex: index + 1,
      variationCount: count,
    }))
  );
}

function normalizeList(value: unknown, maxItems = 5) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return items.map((item) => String(item).trim()).filter(Boolean).slice(0, maxItems);
}

function articleType(value: unknown) {
  const type = typeof value === "string" ? value.trim() : "";
  return ARTICLE_TYPES.has(type) ? type : "auto";
}

function settingValue(settings: GenerationSettings | undefined, camel: string, snake: string = camel) {
  return settings?.[camel] ?? settings?.[snake];
}

function settingBool(settings: GenerationSettings | undefined, camel: string, snake: string = camel) {
  return settingValue(settings, camel, snake) === true;
}

function settingNumber(settings: GenerationSettings | undefined, camel: string, snake: string = camel) {
  const value = settingValue(settings, camel, snake);
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function feedArticleContentHash(article: SourceArticle, effectiveOpts: GenerateOpts) {
  return hashContent(article.content + article.title + buildArticleExtras(effectiveOpts));
}

async function filterNewFeedArticles(
  userId: string,
  articles: SourceArticle[],
  effectiveOpts: GenerateOpts,
  requestedCount: number
) {
  const selected: SourceArticle[] = [];
  const skipped: Array<{ title: string; url?: string; reason: string }> = [];
  const seenHashes = new Set<string>();

  for (const article of articles) {
    const contentHash = feedArticleContentHash(article, effectiveOpts);
    if (seenHashes.has(contentHash)) {
      skipped.push({ title: article.title || "Untitled", url: article.url, reason: "Duplicate in fetched source batch" });
      continue;
    }
    seenHashes.add(contentHash);

    if (article.url) {
      const existingByUrl = await db.select({ id: posts.id }).from(posts)
        .where(and(eq(posts.userId, userId), eq(posts.sourceRefId, article.url)))
        .limit(1);
      if (existingByUrl.length > 0) {
        skipped.push({ title: article.title || "Untitled", url: article.url, reason: "Source URL already generated" });
        continue;
      }
    }

    const existing = await db.select({ id: posts.id }).from(posts)
      .where(and(eq(posts.userId, userId), eq(posts.sourceContentHash, contentHash)))
      .limit(1);
    if (existing.length > 0) {
      skipped.push({ title: article.title || "Untitled", url: article.url, reason: "Already generated" });
      continue;
    }

    selected.push(article);
    if (selected.length >= requestedCount) break;
  }

  return { articles: selected, skipped };
}

async function hydrateFeedArticlesWithFullText(userId: string, articles: SourceArticle[], modelId: string) {
  const hydrated: SourceArticle[] = [];

  for (const article of articles) {
    if (!article.url || !/^https?:\/\//i.test(article.url)) {
      hydrated.push(article);
      continue;
    }

    try {
      const extracted = await extractContent({
        userId,
        sourceType: "url",
        sourceValue: article.url,
        extractModel: modelId,
      });
      const extractedContent = (extracted.content || "").trim();
      hydrated.push({
        ...article,
        title: extracted.title || article.title,
        content: extractedContent.length > article.content.length ? extractedContent : article.content,
      });
    } catch (error) {
      console.warn("[generate] Full-text extraction failed for feed item:", article.url, error instanceof Error ? error.message : error);
      hydrated.push(article);
    }
  }

  return hydrated;
}

function imageAdvancedOptions(settings?: GenerationSettings) {
  const value = settingValue(settings, "imageAdvancedOptions", "image_advanced_options");
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function inlineImageModel(settings?: GenerationSettings) {
  const value = settingValue(settings, "inlineImageModel", "inline_image_model")
    || imageAdvancedOptions(settings).inlineImageModel;
  return openRouterImageModelId(typeof value === "string" ? value : "");
}

export function inlineImageSource(settings?: GenerationSettings) {
  const value = settingValue(settings, "inlineImageSource", "inline_image_source")
    || imageAdvancedOptions(settings).inlineImageSource;
  return value === "stock" ? "stock" : "ai";
}

export function imageDeliveryMode(settings?: GenerationSettings): ImageDeliveryMode {
  const value = settingValue(settings, "imageDeliveryMode", "image_delivery_mode")
    || imageAdvancedOptions(settings).imageDeliveryMode;
  return value === "manual_prompt" ? "manual_prompt" : "generate";
}

export function manualImageProvider(settings?: GenerationSettings): ManualImageProvider {
  const value = settingValue(settings, "manualImageProvider", "manual_image_provider")
    || imageAdvancedOptions(settings).manualImageProvider;
  return value === "midjourney" ? "midjourney" : "midjourney";
}

export function manualPromptSuffix(settings?: GenerationSettings) {
  const value = settingValue(settings, "manualPromptSuffix", "manual_prompt_suffix")
    || imageAdvancedOptions(settings).manualPromptSuffix;
  return typeof value === "string" ? value.trim() : "";
}

function manualPromptImageConfigFromSettings(settings?: GenerationSettings) {
  const imageConfig: Record<string, unknown> = {};
  const imageOptions = imageAdvancedOptions(settings);
  const coverResolution = imageOptions.coverResolution === "512" ? "512" : "1K";
  const inlineResolution = imageOptions.inlineResolution === "512" ? "512" : "1K";
  if (settingBool(settings, "coverEnabled", "cover_enabled")) {
    imageConfig.cover = { resolution: coverResolution };
  }
  const inlineCount = Math.max(0, settingNumber(settings, "inlineCount", "inline_count") ?? 2);
  if (settingBool(settings, "inlineEnabled", "inline_enabled") && inlineCount > 0) {
    imageConfig.inline = { count: inlineCount, resolution: inlineResolution };
  }
  return Object.keys(imageConfig).length ? imageConfig : null;
}

async function resolveFastManualPromptModel(openRouterKey: string) {
  const preferredModels = [
    "openai/gpt-4o-mini",
    "google/gemini-2.0-flash-001",
    "anthropic/claude-3.5-haiku",
  ];

  for (const modelId of preferredModels) {
    try {
      return await resolveOpenRouterTextModel(openRouterKey, modelId);
    } catch {}
  }

  return resolveOpenRouterTextModel(openRouterKey, null);
}

function isBlogDraftSource(sourceType: string) {
  return BLOG_DRAFT_SOURCE_TYPES.has(sourceType);
}

function internalLinkTarget(settings?: GenerationSettings): [number, number] | null {
  if (!settingBool(settings, "enableInternalLinks", "enable_internal_links")) return null;
  const density = String(settingValue(settings, "internalLinkDensity", "internal_link_density") || "balanced");
  return INTERNAL_LINK_TARGETS[density] || INTERNAL_LINK_TARGETS.balanced;
}

export function applyGenerationOverrides(settings: GenerationSettings | undefined, opts: Partial<GenerateOpts> = {}) {
  const nextSettings = { ...(settings || {}) };
  const density = typeof opts.internalLinkDensity === "string" ? opts.internalLinkDensity : "";
  if (density && INTERNAL_LINK_TARGETS[density]) {
    nextSettings.internalLinkDensity = density;
    nextSettings.internal_link_density = density;
  }
  if (opts.imageDeliveryMode === "manual_prompt" || opts.imageDeliveryMode === "generate") {
    nextSettings.imageDeliveryMode = opts.imageDeliveryMode;
    nextSettings.image_delivery_mode = opts.imageDeliveryMode;
  }
  if (opts.manualImageProvider === "midjourney") {
    nextSettings.manualImageProvider = opts.manualImageProvider;
    nextSettings.manual_image_provider = opts.manualImageProvider;
  }
  return nextSettings;
}

export function resolveGenerationContract(settings?: GenerationSettings, opts: Partial<GenerateOpts> = {}) {
  const overrideWordCount = opts.articleWordCount !== undefined ? Number(opts.articleWordCount) : undefined;
  const settingsWordCount = settingNumber(settings, "articleWordCount", "article_word_count");
  const rawWordCount = overrideWordCount !== undefined ? overrideWordCount : settingsWordCount;
  const targetWords = Number.isFinite(rawWordCount) && rawWordCount! > 0 ? Math.round(rawWordCount!) : null;
  const linkDensity = String(settingValue(settings, "internalLinkDensity", "internal_link_density") || "balanced");
  const linkTarget = internalLinkTarget(settings);

  return {
    targetWords,
    minWords: targetWords ? Math.round(targetWords * 0.8) : null,
    maxWords: targetWords ? Math.round(targetWords * 1.2) : null,
    faqTarget: FAQ_TARGET,
    internalLinkDensity: INTERNAL_LINK_TARGETS[linkDensity] ? linkDensity : "balanced",
    internalLinkTarget: linkTarget,
  };
}

function applyArticleDefaults(opts: GenerateOpts, settings?: GenerationSettings): GenerateOpts {
  const includeTableOfContents = opts.includeTableOfContents ?? settingBool(settings, "includeTableOfContents", "include_table_of_contents");
  const enableResearch = opts.enableResearch ?? settingBool(settings, "enableResearch", "enable_research");
  return {
    ...opts,
    articleWordCount: opts.articleWordCount ?? settingValue(settings, "articleWordCount", "article_word_count") ?? undefined,
    includeTableOfContents: includeTableOfContents || undefined,
    enableResearch: enableResearch || undefined,
  };
}

export function articleTemplateInstructions(value: unknown) {
  const type = articleType(value);
  const templates: Record<string, string> = {
    auto: "Choose the best-fit article structure from the brief.",
    how_to: "Use a how-to structure with a pain-point intro, clear steps, examples, and a practical conclusion.",
    list: "Use a list structure: start with the list quickly, then explain why each item matters.",
    what_is: "Use a what-is structure: define the topic early, explain why it matters, and include practical examples.",
    pillar: "Template: Pillar page. Cover the broad topic comprehensively, group cluster sections clearly, and include internal-link opportunities.",
    alternatives: "Use an alternatives structure: address why readers want an alternative, compare options fairly, and give a clear recommendation.",
    best_of: "Use a best-of structure: give the shortlist early, categorize each option by use case, and include selection criteria.",
    comparison: "Template: Comparison. Open with the decision problem, include an at-a-glance table, compare shared features fairly, then recommend who should choose what.",
    newsjacking: "Template: Newsjacking. Cover what happened, why it matters, what it means for the reader, reliable sources, careful caveats, and a subscription/news CTA.",
  };
  return templates[type];
}

function isSportsNewsMode(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const mode = (value as Record<string, unknown>).editorialMode;
  return mode === "news" || mode === "sports_news";
}

export function buildArticleExtras(opts: GenerateOpts) {
  const lines: string[] = [];
  const relatedKeywords = normalizeList(opts.relatedKeywords);
  const outline = typeof opts.outline === "string" ? opts.outline.trim() : "";
  const direction = typeof opts.articleDirection === "string" ? opts.articleDirection.trim() : "";
  const customInstructions = typeof opts.customInstructions === "string" ? opts.customInstructions.trim() : "";
  const titleOverride = cleanPostTitle(typeof opts.articleTitleOverride === "string" ? opts.articleTitleOverride : "");
  const contract = resolveGenerationContract(undefined, opts);

  if (titleOverride) lines.push(`Use this exact H1 title: ${titleOverride}.`);
  const template = articleType(opts.articleType) === "auto" ? "" : articleTemplateInstructions(opts.articleType);
  if (template) lines.push(template);
  if (relatedKeywords.length) lines.push(`Naturally cover these related keywords: ${relatedKeywords.join(", ")}.`);
  if (contract.targetWords && contract.minWords && contract.maxWords) {
    lines.push(`Target article length: about ${contract.targetWords} words; acceptable range ${contract.minWords}-${contract.maxWords} words.`);
  }
  lines.push("If the topic has realistic reader follow-up questions, include a concise FAQ with specific answers; skip FAQ rather than adding generic filler.");
  lines.push("Do not pad the article with repeated sentences or meta notes about the content. Every paragraph must end with a complete sentence.");
  if (opts.includeTableOfContents === true) lines.push("Include a concise table of contents near the beginning.");
  if (opts.enableResearch === true) lines.push("Add useful research context, examples, and clearly explained claims.");
  if (outline) lines.push(`Use this outline as the article structure:\n${outline}`);
  if (direction) lines.push(`Unique angle or proprietary insight to include: ${direction}`);
  if (customInstructions) lines.push(`Custom instructions: ${truncatePromptText(customInstructions, 1500)}`);

  return lines.length ? `\n\nAdditional article instructions:\n${lines.join("\n\n")}` : "";
}

export function enforceGeneratedArticleContracts(content: string, opts: { sourceType: string; topic: string; settings?: GenerationSettings }) {
  let next = normalizeArticleMarkdown(content, opts.topic, opts.settings);
  next = stripInternalSeoSections(next);
  if (isBlogDraftSource(opts.sourceType)) next = ensureSectionHeadings(next, opts.topic, opts.settings);
  next = ensureInternalMarkdownLinks(next, opts.settings);
  return next;
}

function normalizeArticleMarkdown(content: string, topic: string, settings?: GenerationSettings) {
  const next = content.trim();
  const h1 = next.match(/^#\s+(.+)$/m);
  if (h1) {
    const currentTitle = h1[1].trim();
    if (shouldLocalizeTitle(currentTitle, next, settings)) {
      const localizedTitle = titleFromTurkishBody(next, topic);
      return next.replace(/^#\s+.+$/m, `# ${localizedTitle}`);
    }
    return next;
  }
  const title = cleanPostTitle(topic || "Untitled Post");
  return `# ${title}\n\n${next}`;
}

function shouldLocalizeTitle(title: string, content: string, settings?: GenerationSettings) {
  return isTurkishContent(content, settings) && !/[ğüşöçıİĞÜŞÖÇ]/.test(title);
}

function titleFromTurkishBody(content: string, topic: string) {
  const withoutTitle = content.replace(/^#\s+.+\n*/m, "");
  const sentence = plainArticleText(withoutTitle).split(/(?<=[.!?])\s+/)[0] || topic;
  const polished = sentence
    .replace(/\bkarşılaştığı temel engellerden biri\b.*$/i, "önündeki temel engeller")
    .replace(/\bkarşılaştığı temel engeller\b.*$/i, "karşılaştığı temel engeller")
    .replace(/,\s+.*$/, "")
    .trim();
  return truncateAtWord(cleanPostTitle(polished || topic), 62) || cleanPostTitle(topic || "Untitled Post");
}

const TITLE_STOPWORDS = new Set(["and", "the", "for", "with", "from", "that", "this", "why", "how", "what", "bir", "ile", "ve", "veya", "için", "icin", "olarak", "neden", "nasıl", "nasil", "yeni"]);

function titleTokens(value: string) {
  return [...tokenize(normalizeTopic(value))]
    .filter((token) => token.length > 2 && !TITLE_STOPWORDS.has(token));
}

function titleMatchesSourceTitle(title: string, sourceTitle: string) {
  const normalizedTitle = normalizeTopic(title);
  const normalizedSource = normalizeTopic(sourceTitle);
  if (!normalizedSource || normalizedSource.length < 8) return true;
  if (normalizedTitle.includes(normalizedSource) || normalizedSource.includes(normalizedTitle)) return true;
  const sourceTokens = titleTokens(sourceTitle);
  if (sourceTokens.length < 2) return true;
  const titleSet = new Set(titleTokens(title));
  return sourceTokens.filter((token) => titleSet.has(token)).length >= Math.min(2, sourceTokens.length);
}

export function anchorGeneratedTitleToSource(content: string, sourceTitle?: string, requestedLanguage?: string) {
  const title = cleanPostTitle(sourceTitle || "");
  if (!title) return content;
  if (requestedLanguage && looksLikeRequestedLanguage(content, requestedLanguage) && !looksLikeRequestedLanguage(title, requestedLanguage)) {
    return content;
  }
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1 && titleMatchesSourceTitle(h1[1], title)) return content;
  if (h1) return content.replace(/^#\s+.+$/m, `# ${title}`);
  return `# ${title}\n\n${content}`;
}

function truncateAtWord(value: string, maxChars: number) {
  const cleaned = value.replace(/\s+/g, " ").trim();
  if (cleaned.length <= maxChars) return cleaned;
  const clipped = cleaned.slice(0, maxChars + 1).replace(/\s+\S*$/, "").trim();
  return clipped || cleaned.slice(0, maxChars).trim();
}

function plainArticleText(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]+\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripInternalSeoSections(content: string) {
  return content
    .replace(/^##\s+(?:Template Used|SEO Keywords|Keywords|Slug|Meta Title|Meta Description|Image Suggestions|References)\s*\n+[\s\S]*?(?=\n##\s+|\n#\s+|$)/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function ensureSectionHeadings(content: string, topic: string, settings?: GenerationSettings) {
  if (markdownHeadings(content, 2).length >= 2) return content;
  const blocks = content.split(/\n{2,}/);
  const bodyIndexes = blocks
    .map((block, index) => ({ block: block.trim(), index }))
    .filter(({ block }) => {
      if (!block || /^#{1,6}\s+/.test(block) || /^[-*]\s+/.test(block) || /^\|/.test(block)) return false;
      if (/^(slug|meta title|meta description)$/i.test(block)) return false;
      return wordCount(block) >= 20;
    })
    .map(({ index }) => index);

  if (bodyIndexes.length < 3) return content;

  const turkish = isTurkishContent(content, settings);
  const fallback = turkish
    ? ["Temel Bulgular", "Pratik Etkiler", "Dikkat Edilmesi Gerekenler"]
    : ["Key Findings", "Practical Impact", "What To Watch"];
  const insertBefore = [...new Set(bodyIndexes.slice(1, 4))];

  const used = new Set(markdownHeadings(content, 2).map(normalizeTopic));
  const insertions = insertBefore.map((index, order) => ({
    index,
    heading: sectionHeadingFromParagraph(blocks[index], fallback[order] || fallback.at(-1)!, used, turkish),
  }));
  for (const { index, heading } of insertions.sort((a, b) => b.index - a.index)) {
    blocks.splice(index, 0, `## ${heading}`);
  }

  return blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function sectionHeadingFromParagraph(paragraph: string, fallback: string, used: Set<string>, turkish: boolean) {
  const text = cleanPostTitle(plainArticleText(paragraph));
  const lead = text.match(/^([A-ZÇĞİÖŞÜ][\p{L}0-9-]{3,40})(?:,|\s+ise\b|\s+is\b|\s+are\b)/u)?.[1];
  const candidate = lead
    ? `${lead} ${turkish ? "sonuçları" : "results"}`
    : truncateAtWord(text.split(/(?<=[.!?])\s+/)[0] || fallback, 64);
  const heading = cleanPostTitle(candidate.replace(/[.:;!?]+$/g, "")) || fallback;
  const key = normalizeTopic(heading);
  if (!used.has(key)) {
    used.add(key);
    return heading;
  }
  used.add(normalizeTopic(fallback));
  return fallback;
}

function ensureInternalMarkdownLinks(content: string, settings?: GenerationSettings) {
  const target = internalLinkTarget(settings);
  if (!target) return content;
  const index = settingValue(settings, "internalLinkIndex", "internal_link_index") as { siteHost?: string; pages?: InternalLinkPromptPage[] } | null | undefined;
  const pages = Array.isArray(index?.pages) ? index.pages : [];
  const rules = internalLinkRules(settings);
  if (!pages.length && !rules.length) return content;

  const siteHost = typeof index?.siteHost === "string" ? index.siteHost : "";
  const [minLinks, maxLinks] = target;
  let next = content;
  let usedUrls = new Set(internalMarkdownLinks(next, siteHost));
  if (usedUrls.size >= minLinks) return next;

  for (const rule of rules) {
    if (usedUrls.size >= maxLinks) break;
    if (!rule.url || usedUrls.has(rule.url)) continue;
    for (const trigger of rule.triggers) {
      if (usedUrls.size >= maxLinks) break;
      const linked = linkFirstPlainMention(next, trigger, rule.url);
      if (linked !== next) {
        next = linked;
        usedUrls = new Set(internalMarkdownLinks(next, siteHost));
        break;
      }
    }
  }

  for (const page of lexicalInternalLinkPages(pages, next).slice(0, maxLinks * 2)) {
    if (usedUrls.size >= maxLinks) break;
    const title = (page.title || "").trim();
    const url = (page.url || page.path || "").trim();
    if (title.length < 4 || !url || usedUrls.has(url)) continue;
    const linked = linkFirstPlainMention(next, title, url);
    if (linked !== next) {
      next = linked;
      usedUrls = new Set(internalMarkdownLinks(next, siteHost));
    }
  }

  return next;
}

function internalLinkRules(settings?: GenerationSettings) {
  const raw = settingValue(settings, "internalLinkRules", "internal_link_rules");
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const record = item as Record<string, unknown>;
      const url = typeof record.url === "string" ? record.url.trim() : "";
      const triggers = typeof record.triggers === "string" ? record.triggers.split(",").map((trigger) => trigger.trim()).filter(Boolean) : [];
      return { url, triggers };
    })
    .filter((rule) => rule.url && rule.triggers.length);
}

function internalMarkdownLinks(content: string, siteHost = "") {
  const links = markdownLinks(content);
  return links.filter((url) => url.startsWith("/") || (siteHost ? url.includes(siteHost) : true));
}

function linkFirstPlainMention(content: string, title: string, url: string) {
  const lines = content.split(/\r?\n/);
  const pattern = new RegExp(escapeRegExp(title), "i");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || /^#{1,6}\s/.test(line) || /\]\([^)]+\)/.test(line)) continue;
    if (!pattern.test(line)) continue;
    lines[index] = line.replace(pattern, (match) => `[${match}](${url})`);
    return lines.join("\n");
  }
  return content;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTurkishContent(content: string, settings?: GenerationSettings) {
  const language = String(settingValue(settings, "articleLanguage", "article_language") || "");
  return /turkish|türkçe/i.test(language) || /[ğüşöçıİĞÜŞÖÇ]/.test(content);
}

function buildCampaignUserMessage(article: NonNullable<GenerateOpts["campaignArticle"]>) {
  const lines = ["Write one complete, publish-ready markdown blog article for this campaign item."];

  if (article.mode === "programmatic" && article.programmatic) {
    if (article.title) lines.push(`Use this exact H1 title: ${article.title}`);
    lines.push(`Programmatic template: ${article.programmatic.templateName}`);
    if (article.programmatic.wordRange) {
      lines.push(`Target article length: ${article.programmatic.wordRange[0]}-${article.programmatic.wordRange[1]} words.`);
    }
    const variables = Object.entries(article.programmatic.variables)
      .map(([key, value]) => `${key}: ${value}`)
      .join("; ");
    if (variables) lines.push(`Row data: ${variables}`);
    lines.push("Follow this section plan. Use each non-title heading as an H2 and satisfy the instruction for that section:");
    for (const section of article.programmatic.sections.filter((section) => section.type !== "title")) {
      const words = section.minWords || section.maxWords ? ` (${section.minWords || "?"}-${section.maxWords || "?"} words)` : "";
      lines.push(`- ${section.heading}${words}: ${section.instructions}`);
    }
    if (article.sharedContext) lines.push(`Campaign context: ${article.sharedContext}`);
    lines.push("Return only the finished article markdown.");
    return lines.join("\n");
  }

  if (article.mode === "keyword" && article.keyword) {
    lines.push(`Primary SEO keyword: ${article.keyword}`);
    lines.push("Generate an SEO-optimized H1 title that matches the keyword intent.");
  }

  if ((article.mode === "title" || article.mode === "title_outline") && article.title) {
    lines.push(`Use this exact H1 title: ${article.title}`);
  }

  const outline = Array.isArray(article.outline) ? article.outline.filter((heading) => heading.text.trim()) : [];
  if (outline.length) {
    lines.push("Use this exact heading structure:");
    lines.push(...outline.map((heading) => `${"#".repeat(heading.level)} ${heading.text}`));
  }

  if (article.sharedContext) lines.push(`Campaign context: ${article.sharedContext}`);
  lines.push("Return only the finished article markdown.");
  return lines.join("\n");
}

function buildDraftUserMessage(article: SourceArticle, sourceType: string, opts: GenerateOpts) {
  const articleExtras = buildArticleExtras(opts);
  const variationInstruction = "variationIndex" in article && article.variationCount && article.variationCount > 1
    ? `\n\nDraft variation ${article.variationIndex} of ${article.variationCount}: make this a meaningfully distinct version with a different angle, intro, examples, and section framing while staying on the same topic.`
    : "";

  if (sourceType === "campaign" && opts.campaignArticle) {
    return `${buildCampaignUserMessage(opts.campaignArticle)}${articleExtras}${variationInstruction}`;
  }

  if (sourceType === "article_keyword") {
    return `Write a complete, publish-ready SEO article for this target keyword: "${article.content}".

${opts.articleTitleOverride ? "Use the provided H1 title, then" : "Generate an SEO-optimized H1 title that matches search intent, then"} write the article in markdown with a clear intro, useful H2/H3 structure, and a concise conclusion.${articleExtras}${variationInstruction}`;
  }

  if (sourceType === "article_title") {
    return `Write a complete, publish-ready SEO article using this exact H1 title: "${article.title}".

Keep the title unchanged, then write the article in markdown with a clear intro, useful H2/H3 structure, and a concise conclusion.${articleExtras}${variationInstruction}`;
  }

  return article.url
    ? `Write a blog post based on this source:\n\nTitle: ${article.title}\nURL: ${article.url}\n\nContent:\n${article.content.substring(0, 8000)}${articleExtras}${variationInstruction}`
    : `Write a blog post based on this content:\n\n${article.content.substring(0, 8000)}${articleExtras}${variationInstruction}`;
}

function completionTokenBudget(contract: GenerationContract) {
  if (!contract.maxWords) return 4096;
  return Math.min(12_000, Math.max(4096, Math.round(contract.maxWords * 3)));
}

async function repairShortArticle(opts: {
  content: string;
  contract: GenerationContract;
  draftSystemPrompt: string;
  modelId: string;
  openRouterKey: string;
}) {
  if (!opts.contract.minWords || wordCount(opts.content) >= opts.contract.minWords) return null;

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${opts.openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.modelId,
      messages: [
        { role: "system", content: opts.draftSystemPrompt },
        {
          role: "user",
          content: `The draft below is too short. Expand it to at least ${opts.contract.minWords} words and aim for about ${opts.contract.targetWords} words. Preserve the H1 title, language, markdown links, FAQ section, brand rules, and factual meaning. Add new useful detail instead of repeating existing sentences. Do not include meta notes about the content. End every paragraph with a complete sentence. Return only the finished markdown article.\n\n${opts.content}`,
        },
      ],
      max_completion_tokens: completionTokenBudget(opts.contract),
    }),
  });

  if (!resp.ok) {
    const message = openRouterErrorMessage(await resp.text(), resp.status, opts.modelId);
    throw new Error(message);
  }

  const data = await resp.json() as any;
  const usage = data.usage;
  const openRouterUsage = await getOpenRouterCost(opts.openRouterKey, data);
  return {
    content: data.choices?.[0]?.message?.content || "",
    usage,
    cost: openRouterUsage.cost,
    responseData: { id: data.id, generation: openRouterUsage.stats },
  };
}

async function repairArticleLanguage(opts: {
  content: string;
  language: string;
  draftSystemPrompt: string;
  modelId: string;
  openRouterKey: string;
  contract: GenerationContract;
}) {
  if (!opts.language || looksLikeRequestedLanguage(opts.content, opts.language)) return null;

  const instruction = outputLanguageInstruction(opts.language);
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${opts.openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.modelId,
      messages: [
        { role: "system", content: `${opts.draftSystemPrompt}\n\n${instruction}` },
        {
          role: "user",
          content: `The draft below is in the wrong language. Rewrite it fully in ${opts.language}. Preserve the H1 meaning, markdown structure, factual claims, links, FAQ section, and brand voice. Return only the finished markdown article.\n\n${opts.content}`,
        },
      ],
      max_completion_tokens: completionTokenBudget(opts.contract),
    }),
  });

  if (!resp.ok) {
    const message = openRouterErrorMessage(await resp.text(), resp.status, opts.modelId);
    throw new Error(message);
  }

  const data = await resp.json() as any;
  const usage = data.usage;
  const openRouterUsage = await getOpenRouterCost(opts.openRouterKey, data);
  return {
    content: data.choices?.[0]?.message?.content || "",
    usage,
    cost: openRouterUsage.cost,
    responseData: { id: data.id, generation: openRouterUsage.stats },
  };
}

function cleanSeoValue(value: unknown, maxChars = 220) {
  return truncateAtWord(String(value || "").replace(/^[#*\-\s]+/, "").replace(/\s+/g, " ").trim(), maxChars);
}

function shortAnswer(value: unknown) {
  const text = cleanSeoValue(value, 420);
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
  return sentences.slice(0, 3).join(" ");
}

function stripDanglingSeoEnding(value: string) {
  let next = value.replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i += 1) {
    const cleaned = next
      .replace(/\s*[:|/–—-]\s*$/g, "")
      .replace(/\s*[:|/–—-]?\s+(?:new|yeni|with|for|and|or|ve|ile|için|icin|neden|nasıl|nasil|how|why|what)$/i, "")
      .trim();
    if (cleaned === next) break;
    next = cleaned;
  }
  return next;
}

function cleanSeoMetaTitle(value: unknown, fallback: string) {
  const fallbackTitle = stripDanglingSeoEnding(cleanPostTitle(fallback || "Untitled Post"));
  const raw = stripDanglingSeoEnding(cleanPostTitle(cleanSeoValue(value, 100)));
  const candidate = raw && titleMatchesSourceTitle(raw, fallbackTitle) ? raw : fallbackTitle;
  const clipped = stripDanglingSeoEnding(truncateAtWord(candidate, SEO_META_TITLE_LIMIT));
  return clipped || truncateAtWord(fallbackTitle, SEO_META_TITLE_LIMIT) || "Untitled Post";
}

function cleanSeoMetaDescription(value: unknown, fallbackText: string) {
  const raw = cleanSeoValue(value, 260) || cleanSeoValue(fallbackText, 260);
  const clipped = stripDanglingSeoEnding(truncateAtWord(raw, SEO_META_DESCRIPTION_LIMIT));
  return clipped || truncateAtWord(cleanSeoValue(fallbackText, 260), SEO_META_DESCRIPTION_LIMIT);
}

function stripSeoPackageSections(content: string) {
  const stripHeading = /^(template used|seo keywords|keywords|slug|meta title|meta description|key points|image suggestions|references|faqs?|sıkça sorulan sorular|sık sorulan sorular|sss|frequently asked questions)$/i;
  const kept: string[] = [];
  let skipping = false;

  for (const line of content.split(/\r?\n/)) {
    const heading = line
      .trim()
      .replace(/^#{1,6}\s+/, "")
      .replace(/^\*\*(.+)\*\*$/, "$1")
      .replace(/:$/, "")
      .trim();
    const shouldStrip = stripHeading.test(heading);
    if (shouldStrip) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^#{1,2}\s+/.test(line)) skipping = false;
      else continue;
    }
    kept.push(line);
  }

  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function applySeoPackage(content: string, seo: SeoPackage, opts: { topic: string; settings?: GenerationSettings }) {
  const slug = slugify(seo.slug || opts.topic).split("-").slice(0, 5).join("-") || "article";
  const faqHeading = isTurkishContent(content, opts.settings) ? "## Sık Sorulan Sorular" : "## FAQs";
  const faq = [
    faqHeading,
    "",
    ...seo.faqs.slice(0, 7).flatMap((item) => [
      `### ${item.question.endsWith("?") ? item.question : `${item.question}?`}`,
      shortAnswer(item.answer),
      "",
    ]),
  ].join("\n").trim();

  const article = normalizeArticleMarkdown(stripSeoPackageSections(content), opts.topic, opts.settings);
  const articleTitle = article.match(/^#\s+(.+)$/m)?.[1]?.trim() || opts.topic;
  const metaTitle = cleanSeoMetaTitle(seo.metaTitle, articleTitle);
  const metaDescription = cleanSeoMetaDescription(seo.metaDescription, plainArticleText(article));

  return [
    `## Slug\n${slug}`,
    `## Meta Title\n${metaTitle}`,
    `## Meta Description\n${metaDescription}`,
    article,
    faq,
  ].join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

function parseArticlePlan(value: string) {
  const jsonText = value.match(/\{[\s\S]*\}/)?.[0] || value;
  try {
    const parsed = JSON.parse(jsonText) as { title?: unknown; outline?: unknown };
    const outline = Array.isArray(parsed.outline)
      ? normalizeOutline(parsed.outline.map((item) => String(item)))
      : typeof parsed.outline === "string" ? normalizeOutline(parsed.outline.split("\n")) : "";
    return {
      title: typeof parsed.title === "string" ? cleanPostTitle(parsed.title) : "",
      outline,
    };
  } catch {
    const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
    const title = cleanPostTitle(lines.find((line) => !/^h[23]:/i.test(line))?.replace(/^title:\s*/i, "") || "");
    const outline = normalizeOutline(lines);
    return { title, outline };
  }
}

function normalizeOutline(lines: string[]) {
  return lines
    .map((line) => line.trim().replace(/^#{2,3}\s+/, (hashes) => `${hashes.startsWith("###") ? "H3" : "H2"}: `))
    .filter((line) => /^H[23]:\s+\S/i.test(line))
    .map((line) => line.replace(/^h([23]):/i, "H$1:"))
    .join("\n");
}

export async function generateArticlePlan(opts: Pick<GenerateOpts,
  "userId" | "sourceType" | "sourceValue" | "modelId" | "personaId" | "relatedKeywords" | "articleDirection" | "articleType" | "articleWordCount" | "includeTableOfContents" | "enableResearch"
>) {
  const userId = opts.userId;
  if (!isArticleSource(opts.sourceType)) throw new Error("Article planning only supports article keyword or title sources");
  const sourceValue = String(opts.sourceValue || "").trim();
  if (!sourceValue) throw new Error(opts.sourceType === "article_title" ? "Article title is required" : "Article keyword is required");

  const openRouterKey = await getOpenRouterKey(userId);
  if (!openRouterKey) throw new Error("Add your OpenRouter API key in Settings before planning articles");

  let systemPrompt = "You are an SEO content strategist. Return only valid JSON.";
  let personaModel = opts.modelId || "openai/gpt-4o";
  if (opts.personaId) {
    const [persona] = await db.select().from(personas).where(and(eq(personas.id, opts.personaId), eq(personas.userId, userId))).limit(1);
    if (persona) {
      systemPrompt = `${persona.systemPrompt}\n\nReturn only valid JSON.`;
      personaModel = persona.baseModel;
    }
  }

  const requestedModelId = opts.modelId || personaModel;
  const modelId = await resolveOpenRouterTextModel(openRouterKey, requestedModelId);

  const relatedKeywords = normalizeList(opts.relatedKeywords);
  const wordCount = Number(opts.articleWordCount);
  const prompt = [
    opts.sourceType === "article_title"
      ? `Create an SEO article outline for this exact title: ${sourceValue}`
      : `Create an SEO article title and outline for this target keyword: ${sourceValue}`,
    relatedKeywords.length ? `Related keywords: ${relatedKeywords.join(", ")}` : "",
    articleTemplateInstructions(opts.articleType),
    opts.articleDirection ? `Direction: ${opts.articleDirection}` : "",
    Number.isFinite(wordCount) && wordCount > 0 ? `Target length: about ${Math.round(wordCount)} words.` : "",
    opts.includeTableOfContents ? "The article may include a table of contents." : "",
    opts.enableResearch ? "Favor sections that support useful research context and examples." : "",
    'Return JSON exactly like {"title":"...","outline":["H2: ...","H2: ...","H3: ..."]}. Use 5-8 outline lines.',
  ].filter(Boolean).join("\n");

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt },
      ],
      max_completion_tokens: 1200,
    }),
  });

  if (!resp.ok) {
    const message = openRouterErrorMessage(await resp.text(), resp.status, modelId);
    throw new Error(message);
  }

  const data = await resp.json() as any;
  const plan = parseArticlePlan(data.choices?.[0]?.message?.content || "");
  if (opts.sourceType === "article_title") plan.title = cleanPostTitle(sourceValue);
  if (!plan.title || !plan.outline) throw new Error("Article plan could not be parsed. Try again.");
  return plan;
}

export async function generateContent(opts: GenerateOpts) {
  const userId = opts.schedulerUserId || opts.userId;
  const openRouterKey = await getOpenRouterKey(userId);
  const startedAt = Date.now();

  if (!openRouterKey) {
    throw new Error("Add your OpenRouter API key in Settings before generating content");
  }

  // Get or create job
  let jobId = opts.jobId;
  if (!jobId) {
    const [job] = await db.insert(jobs).values({
      userId,
      sourceType: opts.sourceType,
      sourceValue: opts.sourceValue,
      modelId: opts.modelId || "openai/gpt-4o",
      personaId: opts.personaId || null,
      campaignId: opts.campaignId || null,
      campaignItemId: opts.campaignItemId || null,
      status: "running",
      currentStep: "starting",
    }).returning();
    jobId = job.id;
    if (opts.campaignItemId) {
      await db.update(campaignItems).set({ jobId }).where(eq(campaignItems.id, opts.campaignItemId));
    }
  } else {
    await db.update(jobs).set({ status: "running", currentStep: "starting" }).where(eq(jobs.id, jobId));
  }

  try {
    // Budget is account-level; generation defaults are resolved from the active site profile.
    const accountSettings = await getGlobalSettings(userId);
    const settings = await getEffectiveSettings(userId);
    if (accountSettings?.budgetPaused) {
      await db.update(jobs).set({ status: "failed", errorMessage: "Generation paused — monthly budget exceeded", completedAt: new Date() }).where(eq(jobs.id, jobId));
      return { jobId, status: "failed", error: "Budget exceeded" };
    }

    if (accountSettings?.monthlyBudget) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [costResult] = await db.select({ total: sql<number>`COALESCE(SUM(cost), 0)` })
        .from(generationLogs)
        .where(and(eq(generationLogs.userId, userId), sql`created_at >= ${startOfMonth.toISOString()}`));

      if ((costResult?.total || 0) >= accountSettings.monthlyBudget) {
        await updateGlobalSettings(userId, { budgetPaused: true });
        await db.update(jobs).set({ status: "failed", errorMessage: "Monthly budget exceeded — generation paused", completedAt: new Date() }).where(eq(jobs.id, jobId));
        return { jobId, status: "failed", error: "Budget exceeded" };
      }
    }
    const promptSettings = applyGenerationOverrides((opts.settingsSnapshot || settings) as GenerationSettings | undefined, opts);
    const effectiveOpts = applyArticleDefaults(opts, promptSettings);
    const generationContract = resolveGenerationContract(promptSettings, effectiveOpts);
    const imageMode = imageDeliveryMode(promptSettings || settings || undefined);
    const manualProvider = manualImageProvider(promptSettings || settings || undefined);
    const manualSuffix = manualPromptSuffix(promptSettings || settings || undefined);

    // Load persona if set
    let systemPrompt = "You are a senior blog writer. Return only the finished article body in clean Markdown. Do not include process notes, SEO metadata sections, image suggestions, or internal-link summaries.";
    let personaModel = opts.modelId || "openai/gpt-4o";

    if (opts.personaId) {
      const [persona] = await db.select().from(personas).where(and(eq(personas.id, opts.personaId), eq(personas.userId, userId))).limit(1);
      if (persona) {
        systemPrompt = persona.systemPrompt;
        personaModel = persona.baseModel;
      }
    }

    const requestedModelId = opts.modelId || personaModel;
    const modelId = await resolveOpenRouterTextModel(openRouterKey, requestedModelId);

    const [feedRecord] = opts.feedId
      ? await db.select().from(feeds).where(and(eq(feeds.id, opts.feedId), eq(feeds.userId, userId))).limit(1)
      : [];

    const sourceValue = opts.sourceValue || feedRecord?.sourceUrl || "";
    const feedFilterType = opts.filterType ?? feedRecord?.filterType ?? "none";
    const feedFilterValue = opts.filterValue ?? feedRecord?.filterValue ?? undefined;
    const feedKeywords = normalizeList(opts.keywords ?? feedRecord?.keywords, 25);
    const feedPlatformConfig = { ...(feedRecord?.platformConfig && typeof feedRecord.platformConfig === "object" ? feedRecord.platformConfig as Record<string, unknown> : {}), ...(opts.platformConfig || {}) };
    const feedFilterOldPostsDays = opts.filterOldPostsDays ?? feedRecord?.filterOldPostsDays ?? undefined;
    const feedExtractFullContent = opts.extractFullContent ?? feedRecord?.extractFullContent ?? false;

    // Update feed last_run_at
    if (opts.feedId) {
      await db.update(feeds).set({ lastRunAt: new Date() }).where(eq(feeds.id, opts.feedId));
    }

    await db.update(jobs).set({ currentStep: "fetching_content" }).where(eq(jobs.id, jobId));

    // Fetch source content
    let articles: SourceArticle[] = [];
    const requestedFeedItems = isFeedSource(opts.sourceType)
      ? feedSourceItemCount(opts.postsPerRun ?? feedRecord?.postsPerRun ?? opts.variations)
      : null;
    const explicitFeedOffset = isFeedSource(opts.sourceType) ? feedItemOffset(opts.feedItemOffset) : 0;
    const requestedSourceItems = requestedFeedItems
      ? feedSourceItemCount(requestedFeedItems + explicitFeedOffset)
      : null;
    const feedCandidateLimit = requestedSourceItems ? feedCandidateItemCount(requestedSourceItems) : 0;
    let fetchedSourceItemCount = 0;
    let skippedSourceItems: Array<{ title: string; url?: string; reason: string }> = [];

    if (opts.sourceType === "rss_feed") {
      // Fetch and parse RSS feed
      articles = await fetchRssArticles(sourceValue, feedCandidateLimit, feedFilterOldPostsDays, feedKeywords);
    } else if (opts.sourceType === "reddit" || opts.sourceType === "hackernews" || opts.sourceType === "github") {
      const social = await fetchSocialContent({
        sourceUrl: sourceValue,
        platform: opts.sourceType,
        platformConfig: feedPlatformConfig,
        limit: feedCandidateLimit,
        filterOldPostsDays: feedFilterOldPostsDays,
        filterType: feedFilterType,
        filterValue: feedFilterValue ?? undefined,
        keywords: feedKeywords,
      });
      articles = social.items.map((item) => ({
        title: item.title,
        content: [item.content, item.summary].filter(Boolean).join("\n\n") || item.title,
        url: item.url,
      }));
    } else if (opts.sourceType === "article_keyword") {
      const keyword = opts.sourceValue.trim();
      articles = [{ title: keyword, content: keyword }];
    } else if (opts.sourceType === "article_title") {
      const title = opts.sourceValue.trim();
      articles = [{ title, content: title }];
    } else if (opts.sourceType === "url") {
      const extracted = await extractContent({ userId, sourceType: "url", sourceValue: opts.sourceValue, extractModel: modelId });
      articles = [{ title: extracted.title || "", content: extracted.content || opts.sourceValue, url: opts.sourceValue }];
    } else if (opts.sourceType === "raw_text") {
      articles = [{ title: "", content: opts.sourceValue }];
    } else if (opts.sourceType === "youtube") {
      articles = [{ title: "", content: opts.sourceValue, url: opts.sourceValue }];
    } else if (opts.sourceType === "pdf") {
      articles = [{ title: "", content: opts.sourceValue }];
    } else if (opts.sourceType === "campaign" && opts.campaignArticle) {
      articles = [{
        title: opts.campaignArticle.title || opts.campaignArticle.keyword || "",
        content: buildCampaignUserMessage(opts.campaignArticle),
      }];
    }
    fetchedSourceItemCount = isFeedSource(opts.sourceType) ? articles.length : 0;

    if (requestedFeedItems) {
      const candidateArticles = explicitFeedOffset > 0 || opts.feedItemOffset !== undefined
        ? articles.slice(explicitFeedOffset, explicitFeedOffset + requestedFeedItems)
        : articles;
      const filtered = await filterNewFeedArticles(userId, candidateArticles, effectiveOpts, requestedFeedItems);
      articles = filtered.articles;
      skippedSourceItems = filtered.skipped;
    }

    if (feedExtractFullContent && isFeedSource(opts.sourceType) && articles.length) {
      await db.update(jobs).set({ currentStep: "extracting_full_text" }).where(eq(jobs.id, jobId));
      articles = await hydrateFeedArticlesWithFullText(userId, articles, modelId);
      const filtered = await filterNewFeedArticles(userId, articles, effectiveOpts, requestedFeedItems || articles.length);
      articles = filtered.articles;
      skippedSourceItems = [...skippedSourceItems, ...filtered.skipped];
    }

    if (isArticleSource(opts.sourceType) && !opts.draftVariationCount) {
      const topic = opts.sourceValue.trim();
      const existingTitle = await findExistingTopicDuplicate(userId, topic, opts.sourceValue);
      const indexedPage = findIndexedTopicDuplicate(promptSettings, topic);
      const duplicateLabel = existingTitle || indexedPage?.title || indexedPage?.path || indexedPage?.url || "";
      if (duplicateLabel) {
        const message = `This topic appears to be covered already: ${duplicateLabel}`;
        await db.update(jobs).set({
          status: "failed",
          currentStep: "done",
          errorMessage: message,
          generationError: message,
          generationPlan: { totalDrafts: 0, articles: [], duplicateTopic: duplicateLabel },
          resultPostIds: [],
          completedAt: new Date(),
        }).where(eq(jobs.id, jobId));
        return { jobId, status: "failed", error: message, postIds: [] };
      }
    }

    articles = expandDraftVariations(articles, opts.sourceType, opts.variations, {
      index: opts.draftVariationIndex,
      count: opts.draftVariationCount,
    });

    if (!articles.length) {
      await db.update(jobs).set({
        status: "completed",
        currentStep: "done",
        generationPlan: {
          totalDrafts: 0,
          articles: [],
          requestedSourceItems,
          fetchedSourceItems: fetchedSourceItemCount,
          skippedSourceItems,
        },
        completedAt: new Date(),
      }).where(eq(jobs.id, jobId));
      return { jobId, status: "completed", posts: [] };
    }

    const sportsSkipped: Array<{ title: string; url?: string; reason?: string; sourceName?: string }> = [];
    if (isSportsNewsMode(feedPlatformConfig)) {
      const matrixRows = sportsMatrixRowsFromSettings(promptSettings);
      articles = articles.flatMap((article) => {
        const decision = classifySportsNews({
          title: article.title,
          content: article.content,
          url: article.url,
          sourceValue,
          platformConfig: feedPlatformConfig,
          matrixRows,
        });
        if (!decision.allowed) {
          sportsSkipped.push({
            title: article.title || "Untitled",
            url: article.url,
            reason: decision.reason,
            sourceName: decision.sourceName,
          });
          return [];
        }
        return [{ ...article, sportsDecision: decision }];
      });
    }

    if (!articles.length) {
      const message = sportsSkipped.length
        ? sportsSkipped.map((item) => item.reason).filter(Boolean)[0] || "No news items matched the matrix."
        : "No drafts were created from this source.";
      await db.update(jobs).set({
        status: skippedSourceItems.length && !sportsSkipped.length ? "completed" : "failed",
        currentStep: "done",
        errorMessage: skippedSourceItems.length && !sportsSkipped.length ? null : message,
        generationError: skippedSourceItems.length && !sportsSkipped.length ? null : message,
        generationPlan: {
          totalDrafts: 0,
          articles: [],
          requestedSourceItems,
          fetchedSourceItems: fetchedSourceItemCount,
          skippedSourceItems,
          skippedSportsNews: sportsSkipped,
        },
        resultPostIds: [],
        completedAt: new Date(),
      }).where(eq(jobs.id, jobId));
      return {
        jobId,
        status: skippedSourceItems.length && !sportsSkipped.length ? "completed" : "failed",
        error: skippedSourceItems.length && !sportsSkipped.length ? undefined : message,
        postIds: [],
      };
    }

    const generationPlan = {
      totalDrafts: articles.length,
      articles: articles.map(a => ({ title: a.title || "Untitled", url: a.url, sportsLabel: a.sportsDecision?.label })),
      requestedSourceItems: requestedFeedItems,
      feedItemOffset: opts.feedItemOffset !== undefined ? explicitFeedOffset : null,
      fetchedSourceItems: fetchedSourceItemCount,
      skippedSourceItems,
      batchId: opts.draftBatchId || null,
      variationIndex: opts.draftVariationIndex || null,
      variationCount: opts.draftVariationCount || null,
      skippedSportsNews: sportsSkipped,
      articleType: isArticleSource(opts.sourceType) ? articleType(opts.articleType) : undefined,
      contract: buildGenerationContractMetadata("", promptSettings, effectiveOpts),
      imagesEnabled: Boolean(opts.generateImages && opts.imageConfig),
      imageDeliveryMode: imageMode,
    };

    // Set generation plan
    await db.update(jobs).set({
      generationPlan,
      currentStep: `generating_draft_1_of_${articles.length}`,
    }).where(eq(jobs.id, jobId));

    const createdPostIds: string[] = [];
    const seoQaResults: Array<{ postId: string; title: string; qa: ReturnType<typeof evaluateSeoQa> }> = [];
    const contractResults: Array<{ postId: string; title: string; contract: ReturnType<typeof buildGenerationContractMetadata> }> = [];
    const seoPackagingResults: Array<{ postId: string; title: string; modelId: string; status: string; webSearch: boolean; faqQueryCount: number; error?: string }> = [];
    const imageResolutionResults: Array<{ postId: string; title: string; result?: ReturnType<typeof summarizeImageResolution>; error?: string }> = [];
    const failedDrafts: Array<{ index: number; error: string }> = [];
    let totalCost = 0;
    let totalTokens = 0;
    let lastGenerationError = "";
    let skippedDuplicate = false;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];

      await db.update(jobs).set({
        currentStep: `generating_draft_${i + 1}_of_${articles.length}`,
      }).where(eq(jobs.id, jobId));

      // Check if job was stopped
      const [currentJob] = await db.select({ status: jobs.status }).from(jobs).where(eq(jobs.id, jobId)).limit(1);
      if (currentJob?.status === "failed") break;

      // Check content hash dedup
      const variationKey = article.variationCount && article.variationCount > 1 ? `variation:${article.variationIndex}/${article.variationCount}` : "";
      const contentHash = hashContent(article.content + article.title + buildArticleExtras(effectiveOpts) + variationKey);
      if (article.url || isArticleSource(opts.sourceType)) {
        const existing = await db.select({ id: posts.id }).from(posts)
          .where(and(eq(posts.userId, userId), eq(posts.sourceContentHash, contentHash)))
          .limit(1);
        if (existing.length > 0) {
          console.log(`[generate] Skipping duplicate content: ${article.title}`);
          skippedDuplicate = true;
          continue;
        }
      }

      try {
        // Generate blog post via AI
        const genStart = Date.now();
        const personaHasLanguageInstruction = promptSpecifiesLanguage(systemPrompt);
        const draftLanguage = requestedOutputLanguage(systemPrompt, promptSettings);
        const languageInstruction = outputLanguageInstruction(draftLanguage);
        const settingsInstructions = buildSettingsInstructions(promptSettings, `${article.title}\n${article.url || ""}\n${article.content}`, {
          includeArticleLanguage: !personaHasLanguageInstruction,
        });
        const sportsNewsInstructions = article.sportsDecision ? buildSportsNewsInstructions(article.sportsDecision) : "";
        const draftSystemPrompt = `${systemPrompt}${settingsInstructions}${sportsNewsInstructions}${languageInstruction ? `\n\n${languageInstruction}` : ""}${personaLanguagePriorityInstruction(systemPrompt)}`;
        const baseUserMessage = buildDraftUserMessage(article, opts.sourceType, effectiveOpts);
        const userMessage = languageInstruction ? `${languageInstruction}\n\n${baseUserMessage}` : baseUserMessage;

        const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          signal: AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS),
          headers: {
            Authorization: `Bearer ${openRouterKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: modelId,
            messages: [
              { role: "system", content: draftSystemPrompt },
              { role: "user", content: userMessage },
            ],
            max_completion_tokens: completionTokenBudget(generationContract),
          }),
        });

        if (!aiResp.ok) {
          const errText = await aiResp.text();
          const message = openRouterErrorMessage(errText, aiResp.status, modelId);
          console.error(`[generate] AI error for draft ${i + 1}:`, message);
          throw new Error(message);
        }

        const aiData = await aiResp.json() as any;
        let genContent = enforceGeneratedArticleContracts(cleanGeneratedPostContent(aiData.choices?.[0]?.message?.content || ""), {
          sourceType: opts.sourceType,
          topic: opts.articleTitleOverride || article.title || opts.sourceValue,
          settings: promptSettings,
        });
        genContent = anchorGeneratedTitleToSource(genContent, opts.articleTitleOverride || article.title, draftLanguage);
        const usage = aiData.usage;
        const openRouterUsage = await getOpenRouterCost(openRouterKey, aiData);
        const usageTotals = {
          prompt: Number(usage?.prompt_tokens || 0),
          completion: Number(usage?.completion_tokens || 0),
          total: Number(usage?.total_tokens || 0),
        };
        let requestCost = openRouterUsage.cost;
        const responseData: Record<string, unknown> = { id: aiData.id, model: aiData.model, requestedModelId, generation: openRouterUsage.stats };
        let lengthRepaired = false;
        let languageRepaired = false;

        if (isBlogDraftSource(opts.sourceType) && draftLanguage && !looksLikeRequestedLanguage(genContent, draftLanguage)) {
          if (hasJobSyncBudget(startedAt, AI_REQUEST_TIMEOUT_MS + OPENROUTER_COST_LOOKUP_TIMEOUT_MS + 5_000)) {
            try {
              await db.update(jobs).set({ currentStep: `repairing_language_for_draft_${i + 1}` }).where(eq(jobs.id, jobId));
              const repairedLanguage = await repairArticleLanguage({
                content: genContent,
                language: draftLanguage,
                draftSystemPrompt,
                modelId,
                openRouterKey,
                contract: generationContract,
              });
              if (repairedLanguage?.content) {
                genContent = enforceGeneratedArticleContracts(cleanGeneratedPostContent(repairedLanguage.content), {
                  sourceType: opts.sourceType,
                  topic: opts.articleTitleOverride || article.title || opts.sourceValue,
                  settings: promptSettings,
                });
                genContent = anchorGeneratedTitleToSource(genContent, opts.articleTitleOverride || article.title, draftLanguage);
                usageTotals.prompt += Number(repairedLanguage.usage?.prompt_tokens || 0);
                usageTotals.completion += Number(repairedLanguage.usage?.completion_tokens || 0);
                usageTotals.total += Number(repairedLanguage.usage?.total_tokens || 0);
                requestCost += repairedLanguage.cost;
                responseData.languageRepair = repairedLanguage.responseData;
                languageRepaired = true;
              }
            } catch (languageErr) {
              console.warn("[generate] Language repair failed:", languageErr instanceof Error ? languageErr.message : languageErr);
            }
          } else {
            console.warn(`[generate] Skipping language repair for draft ${i + 1}: function budget nearly exhausted`);
          }
        }

        if (isBlogDraftSource(opts.sourceType) && generationContract.minWords && wordCount(genContent) < generationContract.minWords) {
          if (hasJobSyncBudget(startedAt, AI_REQUEST_TIMEOUT_MS + OPENROUTER_COST_LOOKUP_TIMEOUT_MS + 5_000)) {
            try {
              await db.update(jobs).set({ currentStep: `repairing_length_for_draft_${i + 1}` }).where(eq(jobs.id, jobId));
              const repaired = await repairShortArticle({
                content: genContent,
                contract: generationContract,
                draftSystemPrompt,
                modelId,
                openRouterKey,
              });
              if (repaired?.content) {
                genContent = enforceGeneratedArticleContracts(cleanGeneratedPostContent(repaired.content), {
                  sourceType: opts.sourceType,
                  topic: opts.articleTitleOverride || article.title || opts.sourceValue,
                  settings: promptSettings,
                });
                genContent = anchorGeneratedTitleToSource(genContent, opts.articleTitleOverride || article.title, draftLanguage);
                usageTotals.prompt += Number(repaired.usage?.prompt_tokens || 0);
                usageTotals.completion += Number(repaired.usage?.completion_tokens || 0);
                usageTotals.total += Number(repaired.usage?.total_tokens || 0);
                requestCost += repaired.cost;
                responseData.repair = repaired.responseData;
                lengthRepaired = true;
              }
            } catch (repairErr) {
              console.warn("[generate] Length repair failed:", repairErr instanceof Error ? repairErr.message : repairErr);
            }
          } else {
            console.warn(`[generate] Skipping length repair for draft ${i + 1}: function budget nearly exhausted`);
          }
        }
        const genLatency = Date.now() - genStart;

        // Extract title from generated content
        const titleMatch = genContent.match(/^#\s+(.+)/m);
        const generatedTitle = cleanPostTitle(titleMatch ? titleMatch[1].trim() : article.title || "Untitled Post");
        const postTitle = generatedTitle;

        // Log generation
        const cost = requestCost;
        totalCost += cost;
        totalTokens += usageTotals.total;

        const [post] = await db.insert(posts).values({
          userId,
          title: postTitle,
          content: genContent,
          status: "draft",
          sourceType: opts.sourceType,
          sourceRefId: opts.campaignId || article.url || (isArticleSource(opts.sourceType) ? opts.sourceValue : opts.feedId) || null,
          sourceContentHash: contentHash,
          jobId,
          campaignId: opts.campaignId || null,
          campaignItemId: opts.campaignItemId || null,
          personaId: opts.personaId || null,
          modelId,
        }).returning();

        const contractMetadata = {
          ...buildGenerationContractMetadata(genContent, promptSettings, effectiveOpts, lengthRepaired),
          requestedLanguage: draftLanguage || null,
          languageRepaired,
        };
        contractResults.push({ postId: post.id, title: postTitle, contract: contractMetadata });

        if (isArticleSource(opts.sourceType)) {
          seoQaResults.push({
            postId: post.id,
            title: postTitle,
            qa: evaluateSeoQa(genContent, { keyword: opts.sourceValue, settings: promptSettings, articleType: opts.articleType }),
          });
        }

        await db.insert(generationLogs).values({
          userId,
          postId: post.id,
          usageType: "text",
          modelId,
          provider: modelId.split("/")[0],
          status: "success",
          promptTokens: usageTotals.prompt || undefined,
          completionTokens: usageTotals.completion || undefined,
          totalTokens: usageTotals.total || undefined,
          cost,
          latencyMs: genLatency,
          sessionId: jobId,
          responseData,
        });

        createdPostIds.push(post.id);
        await db.update(jobs).set({
          resultPostIds: createdPostIds,
          generationPlan: {
            ...generationPlan,
            contract: contractMetadata,
            contracts: contractResults,
            seoPackaging: seoPackagingResults,
            imageResolution: imageResolutionResults,
          },
        }).where(eq(jobs.id, jobId));

        // Resolve images after the draft exists. Small AI batches run now if the function budget is still safe.
        if (opts.generateImages && opts.imageConfig) {
          try {
            if (imageMode === "manual_prompt") {
              await db.update(jobs).set({ currentStep: `creating_manual_prompts_for_draft_${i + 1}` }).where(eq(jobs.id, jobId));
              const sharedManualPromptOpts = {
                content: genContent,
                title: postTitle,
                userId,
                postId: post.id,
                jobId: jobId!,
                stylePrompt: promptSettings?.imageStylePrompt || settings?.imageStylePrompt || undefined,
                manualPromptSuffix: manualSuffix,
                imageConfig: opts.imageConfig,
                provider: manualProvider,
              };
              let manualRequest: Awaited<ReturnType<typeof createManualImagePromptRequest | typeof createFallbackManualImagePromptRequest>>;
              if (hasJobSyncBudget(startedAt, MANUAL_PROMPT_SYNC_TIMEOUT_MS + OPENROUTER_COST_LOOKUP_TIMEOUT_MS + 4_000)) {
                try {
                  const promptModelId = await resolveFastManualPromptModel(openRouterKey);
                  manualRequest = await createManualImagePromptRequest({
                    ...sharedManualPromptOpts,
                    modelId: promptModelId,
                    openRouterKey,
                    timeoutMs: MANUAL_PROMPT_SYNC_TIMEOUT_MS,
                  });
                } catch (manualPromptErr) {
                  const reason = manualPromptErr instanceof Error ? manualPromptErr.message : "Manual image prompt model timed out";
                  console.warn(`[images] Manual prompt model failed for draft ${i + 1}, using fallback prompt rows:`, reason);
                  manualRequest = await createFallbackManualImagePromptRequest({
                    ...sharedManualPromptOpts,
                    reason,
                  });
                }
              } else {
                manualRequest = await createFallbackManualImagePromptRequest({
                  ...sharedManualPromptOpts,
                  reason: "serverless_budget_low",
                });
              }
              imageResolutionResults.push({
                postId: post.id,
                title: postTitle,
                result: manualPromptImageResolutionSummary(manualRequest.requests, manualProvider),
              });
              totalCost += manualRequest.cost;
            } else {
              await db.update(jobs).set({ currentStep: `resolving_images_for_draft_${i + 1}` }).where(eq(jobs.id, jobId));
              const immediateAi = JOB_SYNC_BUDGET_MS - (Date.now() - startedAt) >= IMAGE_REQUEST_TIMEOUT_MS + 5_000;

              const imageResults = await resolveLowCostImages({
                content: genContent,
                title: postTitle,
                userId,
                postId: post.id,
                jobId: jobId!,
                imageConfig: opts.imageConfig,
                imageModel: promptSettings?.imageModel || settings?.imageModel || "",
                inlineImageModel: inlineImageModel(promptSettings || settings || undefined),
                stylePrompt: promptSettings?.imageStylePrompt || settings?.imageStylePrompt || undefined,
                settings: {
                  inlineImageSource: inlineImageSource(promptSettings || settings || undefined),
                },
                immediateAi,
              });

              imageResolutionResults.push({ postId: post.id, title: postTitle, result: summarizeImageResolution(imageResults) });
              totalCost += imageResults.cost;
            }
          } catch (imageErr: any) {
            const imageError = imageErr?.message || "Image resolution failed";
            console.warn(`[images] Resolution failed for draft ${i + 1}:`, imageError);
            imageResolutionResults.push({ postId: post.id, title: postTitle, error: imageError });
          }
          await db.update(jobs).set({
            generationPlan: {
              ...generationPlan,
              contract: contractMetadata,
              contracts: contractResults,
              seoPackaging: seoPackagingResults,
              imageResolution: imageResolutionResults,
            },
          }).where(eq(jobs.id, jobId));
        }

      } catch (draftErr: any) {
        lastGenerationError = generationErrorMessage(draftErr);
        console.error(`[generate] Error on draft ${i + 1}:`, lastGenerationError);
        failedDrafts.push({ index: i, error: lastGenerationError });
        await db.update(jobs).set({
          generationError: lastGenerationError,
          generationPlan: { ...generationPlan, failedDrafts, seoPackaging: seoPackagingResults, imageResolution: imageResolutionResults },
        }).where(eq(jobs.id, jobId));
      }
    }

    if (createdPostIds.length === 0) {
      const message = lastGenerationError || (skippedDuplicate ? "This source was already generated. Check My Content for the existing draft." : "No drafts were created from this source.");
      await db.update(jobs).set({
        status: "failed",
        currentStep: "done",
        errorMessage: message,
        generationError: message,
        resultPostIds: [],
        tokenCost: totalTokens,
        totalCost,
        completedAt: new Date(),
      }).where(eq(jobs.id, jobId));
      return { jobId, status: "failed", error: message, postIds: [] };
    }

    // Finalize job
    await db.update(jobs).set({
      status: "completed",
      currentStep: "done",
      resultPostIds: createdPostIds,
      generationPlan: {
        ...generationPlan,
        contract: contractResults[0]?.contract || generationPlan.contract,
        contracts: contractResults,
        failedDrafts,
        seoPackaging: seoPackagingResults,
        imageResolution: imageResolutionResults,
        seoQa: seoQaResults,
      },
      tokenCost: totalTokens,
      totalCost,
      completedAt: new Date(),
    }).where(eq(jobs.id, jobId));
    if (imageResolutionResults.some((item) => (item.result?.queued || 0) > 0)) {
      kickDeferredImageWorker(userId);
    }

    return { jobId, status: "completed", postIds: createdPostIds };

  } catch (err: any) {
    console.error("[generate] Fatal error:", err);
    await db.update(jobs).set({
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    }).where(eq(jobs.id, jobId));
    return { jobId, status: "failed", error: err.message };
  }
}

async function fetchRssArticles(feedUrl: string, limit: number, filterOldDays?: number, keywords: string[] = []) {
  try {
    const resp = await fetch(feedUrl, { signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS) });
    const text = await resp.text();

    // Simple RSS/Atom parsing
    const items: SourceArticle[] = [];

    // Extract items from RSS
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;

    let match;
    const regex = text.includes("<entry>") ? entryRegex : itemRegex;
    const keywordNeedles = keywords.map((keyword) => keyword.toLowerCase()).filter(Boolean);
    let scanned = 0;
    const maxScan = Math.max(50, Math.min(200, limit * 5));

    while ((match = regex.exec(text)) !== null && scanned < maxScan) {
      scanned += 1;
      const itemXml = match[1];
      const title = extractTag(itemXml, "title");
      const link = extractTag(itemXml, "link") || extractAttr(itemXml, "link", "href");
      const description = extractTag(itemXml, "description") || extractTag(itemXml, "summary") || extractTag(itemXml, "content:encoded") || extractTag(itemXml, "content");
      const pubDate = extractTag(itemXml, "pubDate") || extractTag(itemXml, "published") || extractTag(itemXml, "updated");
      const content = stripHtml(description || "");
      if (keywordNeedles.length) {
        const searchable = `${title} ${content}`.toLowerCase();
        if (!keywordNeedles.some((keyword) => searchable.includes(keyword))) continue;
      }
      if (filterOldDays && pubDate) {
        const articleDate = new Date(pubDate);
        const cutoff = new Date(Date.now() - filterOldDays * 24 * 60 * 60 * 1000);
        if (articleDate < cutoff) continue;
      }

      items.push({
        title: title || "Untitled",
        content,
        url: link || undefined,
        pubDate: pubDate || undefined,
      });
    }

    return items
      .sort((a, b) => {
        if (!a.pubDate || !b.pubDate) return 0;
        return new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime();
      })
      .slice(0, limit);
  } catch (err) {
    console.error("[generate] RSS fetch error:", err);
    return [];
  }
}

function extractTag(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i").exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return match ? match[1].trim() : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const match = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i").exec(xml);
  return match ? match[1] : "";
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

function hashContent(content: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  // Simple hash using Bun's built-in
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash + data[i]) | 0;
  }
  return Math.abs(hash).toString(36);
}

function markdownSection(content: string, heading: string) {
  const pattern = new RegExp(`^##\\s+(?:${heading})\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|\\n#\\s+|$)`, "im");
  return (content.match(pattern)?.[1] || "").replace(/^`|`$/g, "").trim();
}

function markdownHeadings(content: string, level: 2 | 3) {
  const pattern = new RegExp(`^#{${level}}\\s+(.+)$`, "gm");
  return Array.from(content.matchAll(pattern)).map((match) => match[1].trim());
}

function wordCount(content: string) {
  return plainText(content, 200_000).split(/\s+/).filter(Boolean).length;
}

function markdownLinks(content: string) {
  return Array.from(content.matchAll(/\[[^\]]+]\(([^)]+)\)/g)).map((match) => match[1]);
}

export function faqCount(content: string) {
  return markdownHeadings(content, 3).filter((heading) => /\?/.test(heading)).length
    || (markdownSection(content, "FAQs|FAQ|Sık Sorulan Sorular|SSS|Frequently Asked Questions").match(/^###\s+/gm) || []).length;
}

export function internalLinkCount(content: string, settings?: GenerationSettings) {
  const index = settingValue(settings, "internalLinkIndex", "internal_link_index") as { siteHost?: unknown } | null | undefined;
  const siteHost = typeof index?.siteHost === "string" ? index.siteHost : "";
  return internalMarkdownLinks(content, siteHost).length;
}

export function buildGenerationContractMetadata(
  content: string,
  settings?: GenerationSettings,
  opts: Partial<GenerateOpts> = {},
  lengthRepaired = false
) {
  const contract = resolveGenerationContract(settings, opts);
  return {
    targetWords: contract.targetWords,
    minWords: contract.minWords,
    maxWords: contract.maxWords,
    actualWords: content ? wordCount(content) : null,
    faqTarget: contract.faqTarget,
    faqCount: content ? faqCount(content) : null,
    internalLinkDensity: contract.internalLinkDensity,
    internalLinkTarget: contract.internalLinkTarget,
    internalLinkCount: content ? internalLinkCount(content, settings) : null,
    lengthRepaired,
  };
}

function check(label: string, ok: boolean | null, detail: string): SeoQaCheck {
  return { label, ok, detail };
}

export function evaluateSeoQa(content: string, opts: { keyword?: string; settings?: GenerationSettings; articleType?: string } = {}) {
  const keyword = (opts.keyword || "").trim();
  const text = plainText(content, 200_000);
  const words = wordCount(content);
  const metaTitle = markdownSection(content, "Meta Title");
  const metaDescription = markdownSection(content, "Meta Description");
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  const effectiveMetaTitle = metaTitle || h1;
  const effectiveMetaDescription = metaDescription || text.slice(0, 160);
  const faqs = faqCount(content);
  const headings = markdownHeadings(content, 2).concat(markdownHeadings(content, 3)).map(normalizeTopic);
  const duplicateHeadingCount = headings.length - new Set(headings).size;
  const index = settingValue(opts.settings, "internalLinkIndex", "internal_link_index") as { siteHost?: unknown } | null | undefined;
  const siteHost = typeof index?.siteHost === "string" ? index.siteHost : "";
  const links = markdownLinks(content);
  const internalLinks = links.filter((url) => url.startsWith("/") || (siteHost && url.includes(siteHost)));
  const first100 = text.split(/\s+/).slice(0, 100).join(" ");
  const ctaPattern = /\b(get started|book|schedule|contact|try|download|subscribe|learn more|request a demo)\b/i;
  const checks = [
    check("H1 included", Boolean(h1), h1 || "Missing H1."),
    check("Meta title available", Boolean(effectiveMetaTitle) && effectiveMetaTitle.length <= 70, effectiveMetaTitle ? `${effectiveMetaTitle.length} chars` : "Missing title."),
    check("Meta description available", effectiveMetaDescription.length >= 80 && effectiveMetaDescription.length <= 180, effectiveMetaDescription ? `${effectiveMetaDescription.length} chars` : "Missing description."),
    check("Article length reasonable", words >= 1200 && words <= 2500, `${words} words`),
    check("Keyword appears early", keyword ? normalizeTopic(first100).includes(normalizeTopic(keyword)) : null, keyword || "No primary keyword."),
    check("FAQs included", faqs >= 3 && faqs <= 7, `${faqs} FAQs`),
    check("No repeated headings", duplicateHeadingCount === 0, duplicateHeadingCount ? `${duplicateHeadingCount} repeated` : "No duplicates."),
    check("CTA included", ctaPattern.test(content), "Looks for action language."),
    check("Internal links included", siteHost ? internalLinks.length > 0 : null, siteHost ? `${internalLinks.length} internal links` : "No sitemap host."),
  ];
  const scored = checks.filter((item) => item.ok !== null);
  const passed = scored.filter((item) => item.ok).length;
  return {
    articleType: articleType(opts.articleType),
    score: scored.length ? Math.round((passed / scored.length) * 100) : 0,
    passed,
    total: scored.length,
    checks,
  };
}

function plainText(value: string, maxChars = 900) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}

function cleanManualImagePrompt(value: string) {
  return stripTrailingMidjourneyParams(value
    .replace(/^```(?:text|markdown)?/i, "")
    .replace(/```$/i, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/^\s*(?:midjourney prompt|prompt)\s*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2500));
}

function stripTrailingMidjourneyParams(value: string) {
  return value
    .replace(/(?:\s+--[a-z][a-z0-9-]*(?:\s+(?!--)[^\s]+)*)+\s*$/i, "")
    .trim();
}

export function appendManualPromptSuffix(prompt: string, suffix?: string | null) {
  const cleanedPrompt = cleanManualImagePrompt(prompt);
  const cleanedSuffix = typeof suffix === "string" ? suffix.trim() : "";
  return cleanedSuffix ? `${cleanedPrompt} ${cleanedSuffix}`.trim() : cleanedPrompt;
}

export function buildManualImagePromptMessages(opts: {
  title: string;
  content: string;
  stylePrompt?: string | null;
}) {
  const style = stripTrailingMidjourneyParams(
    opts.stylePrompt?.trim()
      || "A colorful modern editorial illustration, hand-drawn graphic style, clean white background, no text, no letters, no numbers, no typography"
  );
  const articleContext = plainText(opts.content, 1800);
  return {
    system: [
      "You write one Midjourney image prompt for a generated blog post.",
      "Return only the final prompt as plain text. Do not add markdown, labels, quotes, explanations, alternatives, or bullets.",
      "Preserve the saved visual style and constraints, but do not add Midjourney parameter suffixes such as --ar, --s, --v, --style, --sref, or --profile.",
      "The app appends the saved Midjourney suffix after your response.",
      "Change only the article-specific subject, scene, symbols, and context.",
      "Unless the saved style explicitly conflicts, include: no text, no letters, no numbers, no typography.",
    ].join(" "),
    user: [
      `Article title: ${opts.title}`,
      `Article context: ${articleContext}`,
      `Saved Midjourney style/reference: ${style}`,
      "Write one polished Midjourney prompt for the whole article, suitable as the cover image.",
    ].join("\n\n"),
  };
}

async function createManualImagePromptRequest(opts: {
  userId: string;
  postId: string;
  jobId: string;
  modelId: string;
  openRouterKey: string;
  title: string;
  content: string;
  stylePrompt?: string | null;
  manualPromptSuffix?: string | null;
  imageConfig: any;
  provider: ManualImageProvider;
  timeoutMs?: number;
}) {
  const startedAt = Date.now();
  const messages = buildManualImagePromptMessages({
    title: opts.title,
    content: opts.content,
    stylePrompt: opts.stylePrompt,
  });
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(opts.timeoutMs || AI_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${opts.openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.modelId,
      messages: [
        { role: "system", content: messages.system },
        { role: "user", content: messages.user },
      ],
      max_completion_tokens: 700,
    }),
  });

  if (!resp.ok) {
    const message = openRouterErrorMessage(await resp.text(), resp.status, opts.modelId);
    await db.insert(generationLogs).values({
      userId: opts.userId,
      postId: opts.postId,
      usageType: "text",
      modelId: opts.modelId,
      provider: opts.modelId.split("/")[0],
      status: "failed",
      latencyMs: Date.now() - startedAt,
      sessionId: opts.jobId,
      responseData: { error: message, task: "manual_image_prompt" },
    });
    throw new Error(message);
  }

  const data = await resp.json() as any;
  const prompt = appendManualPromptSuffix(data.choices?.[0]?.message?.content || "", opts.manualPromptSuffix);
  if (!prompt) throw new Error("Manual image prompt could not be drafted");

  const usage = data.usage;
  const openRouterUsage = await getOpenRouterCost(opts.openRouterKey, data);
  await db.insert(generationLogs).values({
    userId: opts.userId,
    postId: opts.postId,
    usageType: "text",
    modelId: opts.modelId,
    provider: opts.modelId.split("/")[0],
    status: "success",
    promptTokens: Number(usage?.prompt_tokens || 0) || undefined,
    completionTokens: Number(usage?.completion_tokens || 0) || undefined,
    totalTokens: Number(usage?.total_tokens || 0) || undefined,
    cost: openRouterUsage.cost,
    latencyMs: Date.now() - startedAt,
    sessionId: opts.jobId,
    responseData: { id: data.id, generation: openRouterUsage.stats, task: "manual_image_prompt" },
  });

  const requests = await insertManualImagePromptRequests({ ...opts, prompt });

  return {
    requests: requests.map((request) => ({
      id: request.id,
      type: request.type === "inline" ? "inline" as const : "cover" as const,
      position: request.position || 0,
    })),
    prompt,
    cost: openRouterUsage.cost,
  };
}

async function insertManualImagePromptRequests(opts: {
  userId: string;
  postId: string;
  jobId: string;
  modelId: string;
  title: string;
  prompt: string;
  imageConfig: any;
  provider: ManualImageProvider;
}) {
  const targets = imageTargets(opts.imageConfig);
  if (!targets.length) throw new Error("Manual image prompt has no enabled image slots");

  return db.insert(imageGenerationRequests).values(targets.map((target) => ({
    userId: opts.userId,
    postId: opts.postId,
    jobId: opts.jobId,
    provider: opts.provider,
    modelId: opts.modelId,
    prompt: opts.prompt,
    altText: `${target.type === "cover" ? "Featured image" : "Article image"} for ${opts.title}`.slice(0, 180),
    type: target.type,
    position: target.position,
    aspectRatio: target.aspectRatio,
    resolution: target.resolution,
    status: "pending",
  }))).returning({
    id: imageGenerationRequests.id,
    type: imageGenerationRequests.type,
    position: imageGenerationRequests.position,
  });
}

function buildFallbackManualImagePrompt(opts: {
  title: string;
  content: string;
  stylePrompt?: string | null;
  manualPromptSuffix?: string | null;
}) {
  const style = stripTrailingMidjourneyParams(
    opts.stylePrompt?.trim()
      || "A colorful modern editorial illustration, clean white background, no text, no letters, no numbers, no typography"
  );
  const context = plainText(opts.content, 500);
  return appendManualPromptSuffix([
    style,
    `Editorial cover image for an article titled "${opts.title}".`,
    context ? `Visual context: ${context}` : "",
    "Show the main subject clearly with realistic professional composition, no text, no letters, no numbers, no typography.",
  ].filter(Boolean).join(" "), opts.manualPromptSuffix);
}

async function createFallbackManualImagePromptRequest(opts: {
  userId: string;
  postId: string;
  jobId: string;
  title: string;
  content: string;
  stylePrompt?: string | null;
  manualPromptSuffix?: string | null;
  imageConfig: any;
  provider: ManualImageProvider;
  reason: string;
}) {
  const prompt = buildFallbackManualImagePrompt(opts);
  const modelId = "manual/fallback-prompt";
  const requests = await insertManualImagePromptRequests({ ...opts, modelId, prompt });
  await db.insert(generationLogs).values({
    userId: opts.userId,
    postId: opts.postId,
    usageType: "text",
    modelId,
    provider: "manual",
    status: "success",
    sessionId: opts.jobId,
    responseData: { task: "manual_image_prompt_fallback", reason: opts.reason },
  });

  return {
    requests: requests.map((request) => ({
      id: request.id,
      type: request.type === "inline" ? "inline" as const : "cover" as const,
      position: request.position || 0,
    })),
    prompt,
    cost: 0,
  };
}

export async function createManualImagePromptRequestsForPost(userId: string, postId: string) {
  const [post] = await db
    .select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
      jobId: posts.jobId,
    })
    .from(posts)
    .where(and(eq(posts.id, postId), eq(posts.userId, userId)))
    .limit(1);

  if (!post) throw new Error("Post not found");

  const existingRequests = await db
    .select({ id: imageGenerationRequests.id, status: imageGenerationRequests.status })
    .from(imageGenerationRequests)
    .where(and(
      eq(imageGenerationRequests.postId, postId),
      eq(imageGenerationRequests.userId, userId),
      inArray(imageGenerationRequests.status, ["pending", "queued", "processing", "failed", "done"]),
    ));

  if (existingRequests.length > 0) {
    return {
      created: 0,
      existing: existingRequests.length,
      requestIds: existingRequests.map((request) => request.id),
      message: "Image prompts already exist for this post",
    };
  }

  const openRouterKey = await getOpenRouterKey(userId);
  if (!openRouterKey) throw new Error("Add your OpenRouter API key in Settings before generating image prompts");

  const settings = await getEffectiveSettings(userId);
  const imageConfig = manualPromptImageConfigFromSettings(settings);
  if (!imageConfig) throw new Error("Enable cover or inline images in Settings before creating image prompts");

  let modelId = "manual/fallback-prompt";
  let jobId = post.jobId;
  if (!jobId) {
    try {
      modelId = await resolveFastManualPromptModel(openRouterKey);
    } catch {}
    const [job] = await db.insert(jobs).values({
      userId,
      sourceType: "manual_image_prompts",
      sourceValue: post.title,
      modelId,
      status: "completed",
      currentStep: "manual_image_prompts",
      resultPostIds: [post.id],
      completedAt: new Date(),
    }).returning({ id: jobs.id });
    jobId = job.id;
  }

  const sharedManualPromptOpts = {
    userId,
    postId,
    jobId,
    title: post.title,
    content: post.content,
    stylePrompt: settings?.imageStylePrompt,
    manualPromptSuffix: manualPromptSuffix(settings),
    imageConfig,
    provider: manualImageProvider(settings),
  };
  let result: Awaited<ReturnType<typeof createManualImagePromptRequest | typeof createFallbackManualImagePromptRequest>>;
  try {
    if (modelId === "manual/fallback-prompt") {
      modelId = await resolveFastManualPromptModel(openRouterKey);
    }
    result = await createManualImagePromptRequest({
      ...sharedManualPromptOpts,
      modelId,
      openRouterKey,
      timeoutMs: MANUAL_PROMPT_SYNC_TIMEOUT_MS,
    });
  } catch (error) {
    result = await createFallbackManualImagePromptRequest({
      ...sharedManualPromptOpts,
      reason: error instanceof Error ? error.message : "manual_prompt_recovery_failed",
    });
  }

  return {
    created: result.requests.length,
    existing: 0,
    requestIds: result.requests.map((request) => request.id).filter(Boolean),
    modelId,
    prompt: result.prompt,
    cost: result.cost,
  };
}

export async function generateQueuedImageRequest(request: typeof imageGenerationRequests.$inferSelect) {
  if (!request.jobId) throw new Error("Queued image request is missing job data");

  const openRouterKey = await getOpenRouterKey(request.userId);
  const modelId = await validateImageModelForRequest(openRouterKey, openRouterImageModelId(request.modelId), request.type);

  const result = await generateSingleImage(
    request.prompt,
    request.altText || "Article image",
    modelId,
    request.resolution || "1K",
    request.aspectRatio || "16:9",
    request.userId,
    request.jobId,
    request.type,
    request.position || 0,
    request.postId || null,
    openRouterKey || ""
  );

  if (result?.storagePath && request.postId) {
    const [asset] = await db
      .update(imageAssets)
      .set({ postId: request.postId, status: "used" })
      .where(and(eq(imageAssets.userId, request.userId), eq(imageAssets.storagePath, result.storagePath)))
      .returning();
    if (asset) {
      await db
        .update(imageGenerationRequests)
        .set({ importedAssetId: asset.id, updatedAt: new Date() })
        .where(eq(imageGenerationRequests.id, request.id));
    }
  }

  return result;
}

export function openRouterImageRequestPayload(modelId: string, prompt: string, resolution: string, aspectRatio: string) {
  return {
    model: modelId,
    prompt,
    resolution: openRouterImageResolution(modelId, resolution),
    aspect_ratio: aspectRatio,
  };
}

export function openRouterImageBase64(data: any) {
  const value = data?.data?.[0]?.b64_json || data?.data?.[0]?.b64 || "";
  return typeof value === "string" ? value.replace(/^data:image\/[^;]+;base64,/, "") : "";
}

export function openRouterImageTimeoutMessage() {
  return `OpenRouter image timed out after ${Math.round(IMAGE_REQUEST_TIMEOUT_MS / 1000)}s. Retry later or use stock for inline images.`;
}

function isAbortTimeout(err: unknown) {
  return err instanceof Error && (err.name === "TimeoutError" || /aborted due to timeout/i.test(err.message));
}

async function generateSingleImage(
  prompt: string,
  altText: string,
  modelId: string,
  resolution: string,
  aspectRatio: string,
  userId: string,
  jobId: string,
  type: string,
  position: number,
  postId: string | null,
  openRouterKey: string
): Promise<{ storagePath: string | null; cost: number } | null> {
  if (!openRouterKey) throw new Error("Add your OpenRouter API key in Settings before using AI image models");

  const startedAt = Date.now();
  let resp: Response;
  try {
    resp = await fetch("https://openrouter.ai/api/v1/images", {
      method: "POST",
      signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openRouterImageRequestPayload(modelId, prompt, resolution, aspectRatio)),
    });
  } catch (err) {
    if (!isAbortTimeout(err)) throw err;
    const message = openRouterImageTimeoutMessage();
    await db.insert(generationLogs).values({
      userId,
      postId,
      usageType: "image",
      modelId,
      provider: "openrouter-image",
      status: "failed",
      latencyMs: Date.now() - startedAt,
      sessionId: jobId,
      responseData: { error: message },
    });
    throw new Error(message);
  }

  if (!resp.ok) {
    const errorText = await resp.text().catch(() => "");
    await db.insert(generationLogs).values({
      userId,
      postId,
      usageType: "image",
      modelId,
      provider: "openrouter-image",
      status: "failed",
      latencyMs: Date.now() - startedAt,
      sessionId: jobId,
      responseData: { status: resp.status, error: errorText.slice(0, 1000) },
    });
    throw new Error(`OpenRouter image failed (${resp.status})${errorText ? `: ${errorText.slice(0, 180)}` : ""}`);
  }

  const data = await resp.json() as any;
  const usage = data.usage || {};
  const cost = Number(usage.cost || 0);
  const promptTokens = usage.prompt_tokens ?? null;
  const completionTokens = usage.completion_tokens ?? null;
  const countedTokens = (promptTokens || 0) + (completionTokens || 0);
  const totalTokens = usage.total_tokens ?? (countedTokens || null);
  const imageUrl = data?.data?.[0]?.url || "";
  const base64Image = openRouterImageBase64(data);

  let imageBuffer: Buffer | null = null;

  if (base64Image) {
    imageBuffer = Buffer.from(base64Image, "base64");
  } else if (imageUrl) {
    const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS) });
    if (imgResp.ok) {
      imageBuffer = Buffer.from(await imgResp.arrayBuffer());
    }
  }

  await db.insert(generationLogs).values({
    userId,
    postId,
    usageType: "image",
    modelId,
    provider: "openrouter-image",
    status: imageBuffer ? "success" : "failed",
    promptTokens,
    completionTokens,
    totalTokens,
    cost,
    latencyMs: Date.now() - startedAt,
    sessionId: jobId,
    responseData: { id: data.id, usage },
  });

  if (!imageBuffer) return { storagePath: null, cost };

  try {
    const sharp = (await import("sharp")).default;
    imageBuffer = (await sharp(imageBuffer).webp({ quality: 85 }).toBuffer()) as any;
  } catch {}

  const finalImageBuffer = imageBuffer;
  if (!finalImageBuffer) return { storagePath: null, cost };

  const { storagePath } = await saveImageBuffer(finalImageBuffer, userId, {
    type,
    prompt,
    altText,
    modelId,
    provider: "openrouter-image",
    sourceKind: "ai",
    aspectRatio,
    resolution,
    position,
    cost,
    jobId,
    postId: postId || undefined,
  });

  return { storagePath, cost };
}
