import { db } from "../db/index.js";
import { safeError } from "../http/error-contract.js";
import { campaignItems, imageAssets, imageGenerationRequests, jobs, posts, feeds, generationLogs, personas, userSettings, sites, siteIntegrations } from "../db/schema.js";
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
import { slugify } from "./slugify.js";
import { getEffectiveSettings, getGlobalSettings, getPinnedSiteSettings, updateGlobalSettings } from "./user-settings.js";
import { buildSportsNewsInstructions, classifySportsNews, sportsMatrixRowsFromSettings } from "./sports-news.js";
import { fetchSocialContent } from "./fetch-social-content.js";
import { imageTargets } from "./image-slots.js";
import { classifyEditorialTopics, inspectFeedRouting, mergeTopicTags, normalizeFeedEditorialDefaults, rssPublicationDate } from "./feed-routing.js";
import { completeSentenceWithinLimit, isOrtakAlanProfile, normalizeOrtakAlanMetadata } from "./ortak-alan-publishing.js";
import { enqueueSeoMetadata, kickSeoMetadataWorker } from "./seo-metadata.js";
import type { GenerateOpts, GenerationSettings, SeoQaCheck, SourceArticle } from "./generation-types.js";
export type { GenerateOpts } from "./generation-types.js";
import {
  expandDraftVariations,
  feedCandidateItemCount,
  feedItemOffset,
  feedSourceItemCount,
  fetchRssArticles,
  filterNewFeedArticles,
  hashContent,
  hydrateFeedArticlesWithFullText,
  isArticleSource,
  isBlogDraftSource,
  isFeedSource,
} from "./generation-sources.js";
export { expandDraftVariations, feedCandidateItemCount, feedSourceItemCount } from "./generation-sources.js";
import {
  applyGenerationOverrides,
  articleTemplateInstructions,
  articleType,
  buildArticleExtras,
  buildSettingsInstructions,
  buildWriterSystemPrompt,
  findIndexedTopicDuplicate,
  internalLinkTarget,
  normalizeList,
  normalizeTopic,
  resolveGenerationContract,
  settingBool,
  settingNumber,
  settingValue,
  tokenize,
  topicCoveredByText,
  truncatePromptText,
  type GenerationContract,
} from "./generation-contracts.js";
export {
  applyGenerationOverrides,
  articleTemplateInstructions,
  buildArticleExtras,
  buildSettingsInstructions,
  findIndexedTopicDuplicate,
  resolveGenerationContract,
} from "./generation-contracts.js";
import {
  anchorGeneratedTitleToSource,
  buildGenerationContractMetadata,
  enforceGeneratedArticleContracts,
  evaluateSeoQa,
  generatedPostTitle,
  looksLikeRequestedLanguage,
  outputLanguageInstruction,
  openRouterErrorMessage,
  personaLanguagePriorityInstruction,
  plainText,
  promptSpecifiesLanguage,
  requestedOutputLanguage,
  truncateAtWord,
  wordCount,
} from "./generation-output.js";
export {
  anchorGeneratedTitleToSource,
  buildGenerationContractMetadata,
  enforceGeneratedArticleContracts,
  evaluateSeoQa,
  faqCount,
  internalLinkCount,
  openRouterErrorMessage,
} from "./generation-output.js";


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
const OPENROUTER_COST_LOOKUP_DELAY_MS = 900;
const OPENROUTER_COST_LOOKUP_TIMEOUT_MS = 4_000;

function hasJobSyncBudget(startedAt: number, requiredMs: number) {
  return JOB_SYNC_BUDGET_MS - (Date.now() - startedAt) >= requiredMs;
}

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
      console.warn("[openrouter] Cost lookup failed", safeError(err));
    }
  }

  return {
    stats,
    cost: numberOrZero(stats?.total_cost ?? responseData?.usage?.total_cost ?? responseData?.usage?.cost ?? responseData?.usage),
  };
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

function applyArticleDefaults(opts: GenerateOpts, settings?: GenerationSettings): GenerateOpts {
  const includeTableOfContents = opts.includeTableOfContents ?? settingBool(settings, "includeTableOfContents", "include_table_of_contents");
  const enableResearch = opts.enableResearch ?? settingBool(settings, "enableResearch", "enable_research");
  const configuredWordCount = settingValue(settings, "articleWordCount", "article_word_count");
  return {
    ...opts,
    articleWordCount: opts.articleWordCount ?? (typeof configuredWordCount === "string" || typeof configuredWordCount === "number" ? configuredWordCount : undefined),
    includeTableOfContents: includeTableOfContents || undefined,
    enableResearch: enableResearch || undefined,
  };
}

function isSportsNewsMode(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const mode = (value as Record<string, unknown>).editorialMode;
  return mode === "news" || mode === "sports_news";
}

function feedDuplicateDependencies(userId: string) {
  return {
    contentHash: (article: SourceArticle, effectiveOpts: GenerateOpts) =>
      hashContent(article.content + article.title + buildArticleExtras(effectiveOpts)),
    sourceUrlExists: async (url: string) => {
      const existing = await db.select({ id: posts.id }).from(posts)
        .where(and(eq(posts.userId, userId), eq(posts.sourceRefId, url)))
        .limit(1);
      return existing.length > 0;
    },
    contentHashExists: async (contentHash: string) => {
      const existing = await db.select({ id: posts.id }).from(posts)
        .where(and(eq(posts.userId, userId), eq(posts.sourceContentHash, contentHash)))
        .limit(1);
      return existing.length > 0;
    },
  };
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

  const [existingJob] = opts.jobId
    ? await db.select().from(jobs).where(and(eq(jobs.id, opts.jobId), eq(jobs.userId, userId))).limit(1)
    : [];
  if (opts.jobId && !existingJob) throw new Error("Job not found");

  const requestedFeedId = existingJob?.feedId || opts.feedId;
  const [feedRecord] = requestedFeedId
    ? await db.select().from(feeds).where(and(eq(feeds.id, requestedFeedId), eq(feeds.userId, userId))).limit(1)
    : [];
  if (requestedFeedId && !feedRecord) throw new Error("Feed not found");

  const hasJobRoutingSnapshot = Boolean(existingJob && (existingJob.feedId || existingJob.siteId || existingJob.preferredIntegrationId));
  let resolvedSiteId = hasJobRoutingSnapshot ? existingJob?.siteId || null : feedRecord?.siteId || opts.siteId || null;
  let resolvedIntegrationId = hasJobRoutingSnapshot ? existingJob?.preferredIntegrationId || null : feedRecord?.integrationId || opts.preferredIntegrationId || null;

  if (feedRecord && !hasJobRoutingSnapshot && feedRecord.routingVersion > 0) {
    const route = await inspectFeedRouting(userId, feedRecord.siteId, feedRecord.integrationId, feedRecord.editorialDefaults);
    if (!route.valid) {
      await db.update(feeds).set({ isActive: false }).where(and(eq(feeds.id, feedRecord.id), eq(feeds.userId, userId)));
      throw new Error(`Feed needs routing before it can run: ${route.errors.join("; ")}`);
    }
    resolvedSiteId = route.site?.id || null;
    resolvedIntegrationId = route.integration?.id || null;
  } else if (!feedRecord && !hasJobRoutingSnapshot) {
    const [requestedSite] = resolvedSiteId
      ? await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, resolvedSiteId), eq(sites.userId, userId))).limit(1)
      : [];
    if (resolvedSiteId && !requestedSite) throw new Error("Site not found");
    const [requestedIntegration] = resolvedIntegrationId
      ? await db.select({ id: siteIntegrations.id, siteId: siteIntegrations.siteId, status: siteIntegrations.status }).from(siteIntegrations).where(and(eq(siteIntegrations.id, resolvedIntegrationId), eq(siteIntegrations.userId, userId))).limit(1)
      : [];
    if (resolvedIntegrationId && !requestedIntegration) throw new Error("Integration not found");
    if (requestedIntegration && resolvedSiteId && requestedIntegration.siteId !== resolvedSiteId) throw new Error("Publishing target does not belong to the selected site");
    if (requestedIntegration && requestedIntegration.status !== "connected") throw new Error("Publishing target is not connected");
    if (requestedIntegration && !resolvedSiteId) resolvedSiteId = requestedIntegration.siteId;
  }

  // Get or create job
  let jobId = opts.jobId;
  if (!jobId) {
    const [job] = await db.insert(jobs).values({
      userId,
      siteId: resolvedSiteId,
      feedId: feedRecord?.id || null,
      preferredIntegrationId: resolvedIntegrationId,
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
    await db.update(jobs).set({
      siteId: resolvedSiteId,
      feedId: feedRecord?.id || existingJob?.feedId || null,
      preferredIntegrationId: resolvedIntegrationId,
      status: "running",
      currentStep: "starting",
    }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  }

  try {
    // Budget is account-level; feed generation resolves defaults from its pinned site.
    const accountSettings = await getGlobalSettings(userId);
    const settings = feedRecord || hasJobRoutingSnapshot
      ? await getPinnedSiteSettings(userId, resolvedSiteId)
      : await getEffectiveSettings(userId, resolvedSiteId);
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
    let systemPrompt = buildWriterSystemPrompt();
    let personaModel = opts.modelId || "openai/gpt-4o";

    if (opts.personaId) {
      const [persona] = await db.select().from(personas).where(and(eq(personas.id, opts.personaId), eq(personas.userId, userId))).limit(1);
      if (persona) {
        systemPrompt = buildWriterSystemPrompt(persona.systemPrompt);
        personaModel = persona.baseModel;
      }
    }

    const requestedModelId = opts.modelId || personaModel;
    const modelId = await resolveOpenRouterTextModel(openRouterKey, requestedModelId);

    const sourceValue = opts.sourceValue || feedRecord?.sourceUrl || "";
    const feedFilterType = opts.filterType ?? feedRecord?.filterType ?? "none";
    const feedFilterValue = opts.filterValue ?? feedRecord?.filterValue ?? undefined;
    const feedKeywords = normalizeList(opts.keywords ?? feedRecord?.keywords, 25);
    const feedPlatformConfig = { ...(feedRecord?.platformConfig && typeof feedRecord.platformConfig === "object" ? feedRecord.platformConfig as Record<string, unknown> : {}), ...(opts.platformConfig || {}) };
    const feedFilterOldPostsDays = opts.filterOldPostsDays ?? feedRecord?.filterOldPostsDays ?? undefined;
    const feedExtractFullContent = opts.extractFullContent ?? feedRecord?.extractFullContent ?? false;

    // Update feed last_run_at
    if (feedRecord) {
      await db.update(feeds).set({ lastRunAt: new Date() }).where(and(eq(feeds.id, feedRecord.id), eq(feeds.userId, userId)));
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
      const filtered = await filterNewFeedArticles(candidateArticles, effectiveOpts, requestedFeedItems, feedDuplicateDependencies(userId));
      articles = filtered.articles;
      skippedSourceItems = filtered.skipped;
    }

    if (feedExtractFullContent && isFeedSource(opts.sourceType) && articles.length) {
      await db.update(jobs).set({ currentStep: "extracting_full_text" }).where(eq(jobs.id, jobId));
      articles = await hydrateFeedArticlesWithFullText(
        articles,
        (article) => extractContent({
          userId,
          sourceType: "url",
          sourceValue: article.url || "",
          extractModel: modelId,
        }),
        (article, error) => console.warn("[generate] Full-text extraction failed for feed item:", article.url, error instanceof Error ? error.message : error),
      );
      const filtered = await filterNewFeedArticles(articles, effectiveOpts, requestedFeedItems || articles.length, feedDuplicateDependencies(userId));
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
      seoContext: effectiveOpts.campaignArticle?.programmatic?.seoContext || null,
    };

    // Set generation plan
    await db.update(jobs).set({
      generationPlan,
      currentStep: `generating_draft_1_of_${articles.length}`,
    }).where(eq(jobs.id, jobId));

    const createdPostIds: string[] = [];
    const seoQaResults: Array<{ postId: string; title: string; qa: ReturnType<typeof evaluateSeoQa> }> = [];
    const contractResults: Array<{ postId: string; title: string; contract: ReturnType<typeof buildGenerationContractMetadata> }> = [];
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
              console.warn("[generate] Language repair failed", safeError(languageErr));
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
              console.warn("[generate] Length repair failed", safeError(repairErr));
            }
          } else {
            console.warn(`[generate] Skipping length repair for draft ${i + 1}: function budget nearly exhausted`);
          }
        }
        const genLatency = Date.now() - genStart;

        genContent = enforceGeneratedArticleContracts(genContent, {
          sourceType: opts.sourceType,
          topic: opts.articleTitleOverride || article.title || opts.sourceValue,
          settings: promptSettings,
        });
        genContent = anchorGeneratedTitleToSource(genContent, opts.articleTitleOverride || article.title, draftLanguage);

        // Extract title from generated content
        const generatedTitle = generatedPostTitle(genContent, opts.articleTitleOverride || article.title || opts.sourceValue);
        const postTitle = generatedTitle;

        // Log generation
        const cost = requestCost;
        totalCost += cost;
        totalTokens += usageTotals.total;

        const [destinationSite] = resolvedSiteId
          ? await db.select().from(sites).where(and(eq(sites.id, resolvedSiteId), eq(sites.userId, userId))).limit(1)
          : [];
        const [destinationIntegration] = resolvedIntegrationId
          ? await db.select().from(siteIntegrations).where(and(eq(siteIntegrations.id, resolvedIntegrationId), eq(siteIntegrations.userId, userId))).limit(1)
          : [];
        const ortakAlan = Boolean(destinationIntegration && isOrtakAlanProfile(destinationIntegration.config));
        const editorialDefaults = normalizeFeedEditorialDefaults(feedRecord?.editorialDefaults, ortakAlan);
        const topicResult = feedRecord && editorialDefaults.aiTopicsEnabled && destinationSite?.editorialTopics?.length
          ? await classifyEditorialTopics({ apiKey: openRouterKey, model: modelId, title: postTitle, content: genContent, vocabulary: destinationSite.editorialTopics })
          : { topics: [] as string[], warning: null as string | null };
        const topicTags = mergeTopicTags(
          ortakAlan ? editorialDefaults.defaultTopicTags : editorialDefaults.defaultTags,
          ortakAlan ? topicResult.topics : [...(article.sportsDecision?.cmsKeywords || []), ...(article.tags || []), ...topicResult.topics],
          ortakAlan ? 7 : 8,
        );
        const articleText = plainText(genContent, 500);
        const excerpt = truncateAtWord(articleText, 180);
        let publishingMetadata: Record<string, unknown> | null = null;
        if (feedRecord && ortakAlan) {
          const integrationConfig = (destinationIntegration?.config || {}) as Record<string, unknown>;
          const ortakAlanExcerpt = completeSentenceWithinLimit(articleText, 180);
          const normalizedEditorialMetadata = normalizeOrtakAlanMetadata({
              contentType: editorialDefaults.contentType,
              excerpt: ortakAlanExcerpt,
              topicTags,
              sources: [{
                name: feedRecord.name,
                url: article.url || "",
                type: "Haber kaynağı",
                publishedAt: rssPublicationDate(article.pubDate),
                note: `Bu içerik ${feedRecord.name} kaynağındaki orijinal yayından hazırlanmıştır.`,
              }],
              author: integrationConfig.defaultAuthor || null,
              editorialOwner: integrationConfig.editorialOwner || "",
              aiAssisted: true,
              aiUsageNote: "Kaynak tarama ve taslak hazırlamada yapay zeka kullanılmıştır; yayın öncesi editöryal kontrol gereklidir.",
              image: { alt: "", source: "", license: "", aiGenerated: false },
            });
          publishingMetadata = {
            ...normalizedEditorialMetadata,
            profile: "ortak_alan_news",
            routingWarnings: [topicResult.warning, rssPublicationDate(article.pubDate) ? null : "RSS item has no valid original publication date", "Cover image metadata will be completed when the image is attached"].filter(Boolean),
          };
        } else if (feedRecord) {
          publishingMetadata = {
            profile: "generic",
            postType: editorialDefaults.postType,
            excerpt,
            tags: topicTags,
            categories: editorialDefaults.defaultCategories,
            routingWarnings: [topicResult.warning].filter(Boolean),
          };
        }

        const [post] = await db.insert(posts).values({
          userId,
          siteId: resolvedSiteId,
          feedId: feedRecord?.id || null,
          preferredIntegrationId: resolvedIntegrationId,
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
          summary: excerpt,
          publishingMetadata,
        }).returning();

        const seoJob = await enqueueSeoMetadata({ userId, postId: post.id, trigger: "generation" });
        if (seoJob.queued) kickSeoMetadataWorker(userId);

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
                  console.warn(`[images] Manual prompt model failed for draft ${i + 1}, using fallback prompt rows`, safeError(reason));
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
            console.warn(`[images] Resolution failed for draft ${i + 1}`, safeError(imageError));
            imageResolutionResults.push({ postId: post.id, title: postTitle, error: imageError });
          }
          await db.update(jobs).set({
            generationPlan: {
              ...generationPlan,
              contract: contractMetadata,
              contracts: contractResults,
              imageResolution: imageResolutionResults,
            },
          }).where(eq(jobs.id, jobId));
        }

      } catch (draftErr: any) {
        lastGenerationError = generationErrorMessage(draftErr);
        console.error(`[generate] Error on draft ${i + 1}`, safeError(lastGenerationError));
        failedDrafts.push({ index: i, error: lastGenerationError });
        await db.update(jobs).set({
          generationError: lastGenerationError,
          generationPlan: { ...generationPlan, failedDrafts, imageResolution: imageResolutionResults },
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
    console.error("[generate] Fatal error", safeError(err));
    await db.update(jobs).set({
      status: "failed",
      errorMessage: err.message,
      completedAt: new Date(),
    }).where(eq(jobs.id, jobId));
    return { jobId, status: "failed", error: err.message };
  }
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
