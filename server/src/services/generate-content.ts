import { db } from "../db/index.js";
import { campaignItems, imageAssets, imageGenerationRequests, jobs, posts, feeds, generationLogs, personas, userSettings } from "../db/schema.js";
import { eq, and, sql } from "drizzle-orm";
import { saveImageBuffer } from "./image-storage.js";
import { getGoogleAiKey, getOpenAiKey, getOpenRouterKey, getReplicateKey } from "./api-keys.js";
import { extractContent } from "./extract-content.js";
import { resolveLowCostImages, type SourceImageCandidate } from "./low-cost-images.js";
import { assertOpenRouterModelAvailable } from "./openrouter-models.js";
import { cleanGeneratedPostContent, cleanPostTitle } from "./post-cleanup.js";
import { retrieveKnowledgeChunks } from "./knowledge.js";
import { buildVoiceContentInstructions } from "./voice-content.js";
import type { CampaignMode, OutlineHeading } from "./campaign-parser.js";
import { buildSportsNewsInstructions, classifySportsNews, sportsMatrixRowsFromSettings, type SportsNewsDecision } from "./sports-news.js";

interface GenerateOpts {
  userId: string;
  sourceType: string;
  sourceValue: string;
  modelId?: string;
  personaId?: string | null;
  variations?: number;
  feedId?: string;
  extractFullContent?: boolean;
  filterOldPostsDays?: number;
  platformConfig?: any;
  generateImages?: boolean;
  imageConfig?: any;
  relatedKeywords?: string[] | string;
  outline?: string;
  articleDirection?: string;
  customInstructions?: string;
  articleType?: string;
  articleTitleOverride?: string;
  articleWordCount?: number | string;
  includeTableOfContents?: boolean;
  enableResearch?: boolean;
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
type SourceArticle = { title: string; content: string; url?: string; hash?: string; sportsDecision?: SportsNewsDecision; sourceImages?: SourceImageCandidate[]; variationIndex?: number; variationCount?: number };
type SeoQaCheck = { label: string; ok: boolean | null; detail: string };
type GenerationContract = ReturnType<typeof resolveGenerationContract>;
const AI_REQUEST_TIMEOUT_MS = 35_000;
const IMAGE_REQUEST_TIMEOUT_MS = 30_000;
const JOB_SYNC_BUDGET_MS = 52_000;
const OPENROUTER_COST_LOOKUP_DELAY_MS = 900;
const OPENROUTER_COST_LOOKUP_TIMEOUT_MS = 4_000;
const ARTICLE_TYPES = new Set(["auto", "how_to", "list", "what_is", "pillar", "alternatives", "best_of", "comparison", "newsjacking"]);
const BLOG_DRAFT_SOURCE_TYPES = new Set(["article_keyword", "article_title", "url", "raw_text", "youtube", "pdf", "rss_feed", "campaign"]);
const FAQ_TARGET: [number, number] = [3, 5];
const INTERNAL_LINK_TARGETS: Record<string, [number, number]> = {
  minimal: [1, 2],
  light: [3, 4],
  balanced: [5, 7],
  rich: [8, 12],
};

export function costEffectiveImageModel(opts: {
  modelId: string;
  googleAiKey: string | null;
  openRouterKey: string | null;
  openAiKey: string | null;
  replicateKey: string | null;
}) {
  if (opts.modelId === "auto/consistent-cover") {
    if (opts.googleAiKey) return "google-ai-studio/gemini-3.1-flash-image";
    if (opts.openAiKey) return "openai/gpt-image-2";
    if (opts.replicateKey) return "replicate/black-forest-labs/flux-schnell";
    if (opts.openRouterKey) return "openrouter/free";
    return opts.modelId;
  }
  if (opts.modelId !== "auto/cost-effective") return opts.modelId;
  if (opts.googleAiKey) return "google-ai-studio/gemini-3.1-flash-image";
  if (opts.openRouterKey) return "openrouter/free";
  if (opts.replicateKey) return "replicate/black-forest-labs/flux-schnell";
  if (opts.openAiKey) return "openai/gpt-image-2";
  return opts.modelId;
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

export function buildSettingsInstructions(settings?: GenerationSettings, sourceText = "") {
  if (!settings) return "";

  const instructions: string[] = [];

  const articleLanguage = String(settingValue(settings, "articleLanguage", "article_language") || "").trim();
  if (articleLanguage) instructions.push(`Write in ${articleLanguage}.`);
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
  if (brandTargetAudience) brand.push(`Audience: ${truncatePromptText(brandTargetAudience, 300)}`);
  if (brandMentions) brand.push(`Brand mention style: ${brandMentions}`);

  const valueProps = summarizeJsonList(settingValue(settings, "brandValueProps", "brand_value_props"), 3);
  if (valueProps.length) brand.push(`Value propositions: ${valueProps.join("; ")}`);

  const ctas = summarizeJsonList(settingValue(settings, "brandCtas", "brand_ctas"), 2);
  if (ctas.length) brand.push(`Calls to action to weave in when natural: ${ctas.join("; ")}`);

  const knowledgeDocuments = settingValue(settings, "knowledgeDocuments", "knowledge_documents");
  const knowledge = settingBool(settings, "knowledgeBaseEnabled", "knowledge_base_enabled") ? retrieveKnowledgeChunks(knowledgeDocuments, sourceText).slice(0, 2) : [];
  if (knowledge.length) brand.push(`Knowledge context:\n${knowledge.map((line) => `  - ${truncatePromptText(line, 600)}`).join("\n")}`);

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

function variationCount(value: unknown) {
  const count = Math.round(Number(value));
  return Number.isFinite(count) ? Math.max(1, Math.min(count, 5)) : 1;
}

export function expandDraftVariations(articles: SourceArticle[], sourceType: string, requested: unknown) {
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

function isBlogDraftSource(sourceType: string) {
  return BLOG_DRAFT_SOURCE_TYPES.has(sourceType);
}

function internalLinkTarget(settings?: GenerationSettings): [number, number] | null {
  if (!settingBool(settings, "enableInternalLinks", "enable_internal_links")) return null;
  const density = String(settingValue(settings, "internalLinkDensity", "internal_link_density") || "balanced");
  return INTERNAL_LINK_TARGETS[density] || INTERNAL_LINK_TARGETS.balanced;
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
  next = ensureInternalMarkdownLinks(next, opts.settings);
  if (isBlogDraftSource(opts.sourceType)) next = ensureFaqSection(next, opts.topic, opts.settings);
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

  if (usedUrls.size < minLinks) {
    const relatedPages = pages
      .filter((page) => (page.title || page.path) && (page.url || page.path))
      .filter((page) => !usedUrls.has((page.url || page.path || "").trim()))
      .slice(0, minLinks - usedUrls.size);
    if (relatedPages.length) next = appendRelatedReading(next, relatedPages, settings);
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

function appendRelatedReading(content: string, pages: InternalLinkPromptPage[], settings?: GenerationSettings) {
  const title = isTurkishContent(content, settings) ? "## İlgili Okumalar" : "## Related Reading";
  const bullets = pages
    .map((page) => {
      const label = (page.title || page.path || "related guide").trim();
      const url = (page.url || page.path || "").trim();
      return label && url ? `- [${label}](${url})` : "";
    })
    .filter(Boolean);
  return bullets.length ? `${content.trim()}\n\n${title}\n${bullets.join("\n")}` : content;
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

function ensureFaqSection(content: string, topic: string, settings?: GenerationSettings) {
  if (faqCount(content) >= FAQ_TARGET[0]) return content;

  const turkish = isTurkishContent(content, settings);
  const label = cleanPostTitle(topic || (content.match(/^#\s+(.+)$/m)?.[1] || "bu konu")).replace(/[?.!]+$/g, "");
  const faq = turkish
    ? [
      "## Sık Sorulan Sorular",
      "",
      `### ${label} neden önemli?`,
      "Bu konu, karar alırken hangi becerilerin ve süreçlerin gerçekten değer yarattığını daha net görmeyi sağlar.",
      "",
      `### ${label} kimler için faydalı?`,
      "Kendi iş akışını iyileştirmek, araçları daha bilinçli kullanmak ve sonuçları ölçmek isteyen ekipler için faydalıdır.",
      "",
      "### Bu konuda ilk adım ne olmalı?",
      "Önce mevcut süreci küçük bir örnekle test etmek, çıktıları ölçmek ve işe yarayan yaklaşımı kademeli olarak genişletmek gerekir.",
    ]
    : [
      "## FAQs",
      "",
      `### Why does ${label} matter?`,
      "It helps readers see which skills, processes, and decisions create the most practical value.",
      "",
      `### Who benefits most from ${label}?`,
      "Teams that want to improve workflows, use tools more deliberately, and measure outcomes benefit most.",
      "",
      "### What is the best first step?",
      "Start with a small workflow test, measure the result, and expand the parts that clearly work.",
    ];

  return `${content.trim()}\n\n${faq.join("\n")}`;
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
  return Math.min(8192, Math.max(4096, Math.round(contract.maxWords * 2)));
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
          content: `The draft below is too short. Expand it to at least ${opts.contract.minWords} words and aim for about ${opts.contract.targetWords} words. Preserve the H1 title, language, markdown links, FAQ section, brand rules, and factual meaning. Return only the finished markdown article.\n\n${opts.content}`,
        },
      ],
      max_tokens: completionTokenBudget(opts.contract),
      plugins: [],
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

  const modelId = opts.modelId || personaModel;
  await assertOpenRouterModelAvailable(openRouterKey, modelId);

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
      max_tokens: 1200,
      plugins: [],
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
    // Budget check
    const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
    if (settings?.budgetPaused) {
      await db.update(jobs).set({ status: "failed", errorMessage: "Generation paused — monthly budget exceeded", completedAt: new Date() }).where(eq(jobs.id, jobId));
      return { jobId, status: "failed", error: "Budget exceeded" };
    }

    if (settings?.monthlyBudget) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const [costResult] = await db.select({ total: sql<number>`COALESCE(SUM(cost), 0)` })
        .from(generationLogs)
        .where(and(eq(generationLogs.userId, userId), sql`created_at >= ${startOfMonth.toISOString()}`));

      if ((costResult?.total || 0) >= settings.monthlyBudget) {
        await db.update(userSettings).set({ budgetPaused: true }).where(eq(userSettings.userId, userId));
        await db.update(jobs).set({ status: "failed", errorMessage: "Monthly budget exceeded — generation paused", completedAt: new Date() }).where(eq(jobs.id, jobId));
        return { jobId, status: "failed", error: "Budget exceeded" };
      }
    }
    const promptSettings = (opts.settingsSnapshot || settings) as GenerationSettings | undefined;
    const effectiveOpts = applyArticleDefaults(opts, promptSettings);
    const generationContract = resolveGenerationContract(promptSettings, effectiveOpts);

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

    const modelId = opts.modelId || personaModel;
    await assertOpenRouterModelAvailable(openRouterKey, modelId);

    // Update feed last_run_at
    if (opts.feedId) {
      await db.update(feeds).set({ lastRunAt: new Date() }).where(eq(feeds.id, opts.feedId));
    }

    await db.update(jobs).set({ currentStep: "fetching_content" }).where(eq(jobs.id, jobId));

    // Fetch source content
    let articles: SourceArticle[] = [];

    if (opts.sourceType === "rss_feed") {
      // Fetch and parse RSS feed
      articles = await fetchRssArticles(opts.sourceValue, opts.variations || 5, opts.filterOldPostsDays);
    } else if (opts.sourceType === "article_keyword") {
      const keyword = opts.sourceValue.trim();
      articles = [{ title: keyword, content: keyword }];
    } else if (opts.sourceType === "article_title") {
      const title = opts.sourceValue.trim();
      articles = [{ title, content: title }];
    } else if (opts.sourceType === "url") {
      const extracted = await extractContent({ userId, sourceType: "url", sourceValue: opts.sourceValue, extractModel: modelId });
      articles = [{ title: extracted.title || "", content: extracted.content || opts.sourceValue, url: opts.sourceValue, sourceImages: extracted.metadata?.sourceImages }];
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

    if (isArticleSource(opts.sourceType)) {
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

    articles = expandDraftVariations(articles, opts.sourceType, opts.variations);

    if (!articles.length) {
      await db.update(jobs).set({ status: "completed", currentStep: "done", completedAt: new Date() }).where(eq(jobs.id, jobId));
      return { jobId, status: "completed", posts: [] };
    }

    const sportsSkipped: Array<{ title: string; url?: string; reason?: string; sourceName?: string }> = [];
    if (isSportsNewsMode(opts.platformConfig)) {
      const matrixRows = sportsMatrixRowsFromSettings(promptSettings);
      articles = articles.flatMap((article) => {
        const decision = classifySportsNews({
          title: article.title,
          content: article.content,
          url: article.url,
          sourceValue: opts.sourceValue,
          platformConfig: opts.platformConfig,
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
        status: "failed",
        currentStep: "done",
        errorMessage: message,
        generationPlan: { totalDrafts: 0, articles: [], skippedSportsNews: sportsSkipped },
        resultPostIds: [],
        completedAt: new Date(),
      }).where(eq(jobs.id, jobId));
      return { jobId, status: "failed", error: message, postIds: [] };
    }

    const generationPlan = {
      totalDrafts: articles.length,
      articles: articles.map(a => ({ title: a.title || "Untitled", url: a.url, sportsLabel: a.sportsDecision?.label })),
      skippedSportsNews: sportsSkipped,
      articleType: isArticleSource(opts.sourceType) ? articleType(opts.articleType) : undefined,
      contract: buildGenerationContractMetadata("", promptSettings, effectiveOpts),
    };

    // Set generation plan
    await db.update(jobs).set({
      generationPlan,
      currentStep: `generating_draft_1_of_${articles.length}`,
    }).where(eq(jobs.id, jobId));

    const createdPostIds: string[] = [];
    const seoQaResults: Array<{ postId: string; title: string; qa: ReturnType<typeof evaluateSeoQa> }> = [];
    const contractResults: Array<{ postId: string; title: string; contract: ReturnType<typeof buildGenerationContractMetadata> }> = [];
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
        const settingsInstructions = buildSettingsInstructions(promptSettings, `${article.title}\n${article.url || ""}\n${article.content}`);
        const sportsNewsInstructions = article.sportsDecision ? buildSportsNewsInstructions(article.sportsDecision) : "";
        const draftSystemPrompt = `${systemPrompt}${settingsInstructions}${sportsNewsInstructions}`;
        const userMessage = buildDraftUserMessage(article, opts.sourceType, effectiveOpts);

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
            max_tokens: completionTokenBudget(generationContract),
            plugins: [],
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
        const usage = aiData.usage;
        const openRouterUsage = await getOpenRouterCost(openRouterKey, aiData);
        const usageTotals = {
          prompt: Number(usage?.prompt_tokens || 0),
          completion: Number(usage?.completion_tokens || 0),
          total: Number(usage?.total_tokens || 0),
        };
        let requestCost = openRouterUsage.cost;
        const responseData: Record<string, unknown> = { id: aiData.id, generation: openRouterUsage.stats };
        let lengthRepaired = false;

        if (isBlogDraftSource(opts.sourceType) && generationContract.minWords && wordCount(genContent) < generationContract.minWords) {
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

        const contractMetadata = buildGenerationContractMetadata(genContent, promptSettings, effectiveOpts, lengthRepaired);
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
          },
        }).where(eq(jobs.id, jobId));

        // Resolve images after the draft exists. Paid AI is queued, never run inline by default.
        if (opts.generateImages && opts.imageConfig) {
          await db.update(jobs).set({ currentStep: `resolving_images_for_draft_${i + 1}` }).where(eq(jobs.id, jobId));

          const imageResults = await resolveLowCostImages({
            content: genContent,
            title: postTitle,
            userId,
            postId: post.id,
            jobId: jobId!,
            imageConfig: opts.imageConfig,
            imageModel: promptSettings?.imageModel || settings?.imageModel || undefined,
            stylePrompt: promptSettings?.imageStylePrompt || settings?.imageStylePrompt || undefined,
            settings: {
              sourceImageAllowed: promptSettings?.sourceImageAllowed,
              aiFallbackEnabled: promptSettings?.aiFallbackEnabled,
              maxAiImagesPerDay: promptSettings?.maxAiImagesPerDay,
              minMinutesBetweenAiImages: promptSettings?.minMinutesBetweenAiImages,
              imageCompressionEnabled: opts.imageConfig?.compressionEnabled ?? promptSettings?.imageCompressionEnabled ?? true,
            },
            sourceImages: (article as any).sourceImages as SourceImageCandidate[] | undefined,
          });

          totalCost += imageResults.cost;
        }

      } catch (draftErr: any) {
        lastGenerationError = generationErrorMessage(draftErr);
        console.error(`[generate] Error on draft ${i + 1}:`, lastGenerationError);
        failedDrafts.push({ index: i, error: lastGenerationError });
        await db.update(jobs).set({
          generationError: lastGenerationError,
          generationPlan: { ...generationPlan, failedDrafts },
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
        seoQa: seoQaResults,
      },
      tokenCost: totalTokens,
      totalCost,
      completedAt: new Date(),
    }).where(eq(jobs.id, jobId));

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

async function fetchRssArticles(feedUrl: string, limit: number, filterOldDays?: number) {
  try {
    const resp = await fetch(feedUrl);
    const text = await resp.text();

    // Simple RSS/Atom parsing
    const items: Array<{ title: string; content: string; url?: string; hash?: string; pubDate?: Date; sourceImages?: SourceImageCandidate[] }> = [];

    // Extract items from RSS
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;

    let match;
    const regex = text.includes("<entry>") ? entryRegex : itemRegex;

    while ((match = regex.exec(text)) !== null && items.length < limit) {
      const itemXml = match[1];
      const title = extractTag(itemXml, "title");
      const link = extractTag(itemXml, "link") || extractAttr(itemXml, "link", "href");
      const description = extractTag(itemXml, "description") || extractTag(itemXml, "summary") || extractTag(itemXml, "content:encoded") || extractTag(itemXml, "content");
      const pubDate = extractTag(itemXml, "pubDate") || extractTag(itemXml, "published") || extractTag(itemXml, "updated");
      const imageUrl = extractAttr(itemXml, "media:content", "url")
        || extractAttr(itemXml, "media:thumbnail", "url")
        || extractAttr(itemXml, "enclosure", "url");

      if (filterOldDays && pubDate) {
        const articleDate = new Date(pubDate);
        const cutoff = new Date(Date.now() - filterOldDays * 24 * 60 * 60 * 1000);
        if (articleDate < cutoff) continue;
      }

      items.push({
        title: title || "Untitled",
        content: stripHtml(description || ""),
        url: link || undefined,
        sourceImages: imageUrl ? [{ url: imageUrl }] : undefined,
      });
    }

    return items;
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

function sectionCue(content: string, index: number) {
  const headings = Array.from(content.matchAll(/^#{2,3}\s+(.+)$/gm)).map((match) => match[1].trim());
  return headings[index] || headings[0] || "";
}

function buildImagePrompt(opts: {
  content: string;
  title: string;
  type: "cover" | "inline";
  index?: number;
  stylePrompt?: string;
}) {
  const style = opts.stylePrompt?.trim() || "Modern, clean, professional editorial image style. No text overlays.";
  const summary = plainText(opts.content);
  const section = opts.type === "inline" ? sectionCue(opts.content, opts.index || 0) : "";
  const subject = opts.type === "cover"
    ? `Create a blog cover image for "${opts.title}".`
    : `Create an inline blog image for "${opts.title}"${section ? `, focused on the section "${section}"` : ""}.`;

  return [
    subject,
    summary ? `Use this article context to choose concrete visual metaphors and details: ${summary}` : "",
    `Style direction: ${style}`,
    "Avoid text, logos, UI screenshots, watermarks, and unreadable typography unless explicitly requested in the style direction.",
  ].filter(Boolean).join("\n\n");
}

function buildImageAltText(opts: {
  title: string;
  type: "cover" | "inline";
  index?: number;
  content: string;
}) {
  const section = opts.type === "inline" ? sectionCue(opts.content, opts.index || 0) : "";
  const detail = section ? `: ${section}` : "";
  return `${opts.type === "cover" ? "Featured image" : "Article image"} for ${opts.title}${detail}`.slice(0, 180);
}

export async function generateQueuedImageRequest(request: typeof imageGenerationRequests.$inferSelect) {
  if (!request.modelId || !request.jobId) throw new Error("Queued image request is missing model/job data");
  const [settings] = await db
    .select({ imageCompressionEnabled: userSettings.imageCompressionEnabled })
    .from(userSettings)
    .where(eq(userSettings.userId, request.userId))
    .limit(1);

  const openRouterKey = await getOpenRouterKey(request.userId);
  const googleAiKey = await getGoogleAiKey(request.userId);
  const openAiKey = await getOpenAiKey(request.userId);
  const replicateKey = await getReplicateKey(request.userId);
  const modelId = costEffectiveImageModel({
    modelId: request.modelId,
    googleAiKey,
    openRouterKey,
    openAiKey,
    replicateKey,
  });

  const result = await generateSingleImage(
    request.prompt,
    request.altText || "Article image",
    modelId,
    request.resolution || "Web",
    request.aspectRatio || "16:9",
    request.userId,
    request.jobId,
    request.type,
    request.position || 0,
    request.postId || null,
    settings?.imageCompressionEnabled ?? true,
    openRouterKey || "",
    googleAiKey,
    openAiKey,
    replicateKey
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
  compressionEnabled: boolean,
  openRouterKey: string,
  googleAiKey: string | null,
  openAiKey: string | null,
  replicateKey: string | null
): Promise<{ storagePath: string | null; cost: number } | null> {
  // Use Google AI Studio for google-ai-studio models
  if (modelId.startsWith("google-ai-studio/")) {
    if (!googleAiKey) {
      throw new Error("Add your Google Gemini API key in Settings before using Google AI Studio image models");
    }
    return generateWithGoogleAI(prompt, altText, modelId, resolution, aspectRatio, userId, jobId, type, position, postId, compressionEnabled, googleAiKey);
  }
  if (modelId.startsWith("openai/")) {
    if (!openAiKey) throw new Error("Add your OpenAI API key in Settings before using OpenAI image models");
    return generateWithOpenAI(prompt, altText, modelId, resolution, aspectRatio, userId, jobId, type, position, postId, compressionEnabled, openAiKey);
  }
  if (modelId.startsWith("replicate/")) {
    if (!replicateKey) throw new Error("Add your Replicate API token in Settings before using Replicate image models");
    return generateWithReplicate(prompt, altText, modelId, resolution, aspectRatio, userId, jobId, type, position, postId, compressionEnabled, replicateKey);
  }

  const startedAt = Date.now();
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
      image_config: {
        aspect_ratio: aspectRatio,
        image_size: resolution === "Web" ? "0.5K" : resolution,
      },
    }),
  });

  if (!resp.ok) {
    console.error(`[image] OpenRouter error: ${resp.status}`);
    return null;
  }

  const data = await resp.json() as any;
  const openRouterUsage = await getOpenRouterCost(openRouterKey, data);
  const usage = data.usage || {};
  const promptTokens = usage.prompt_tokens ?? openRouterUsage.stats?.tokens_prompt ?? openRouterUsage.stats?.native_tokens_prompt ?? null;
  const completionTokens = usage.completion_tokens ?? openRouterUsage.stats?.tokens_completion ?? openRouterUsage.stats?.native_tokens_completion ?? null;
  const countedTokens = (promptTokens || 0) + (completionTokens || 0);
  const totalTokens = usage.total_tokens ?? (countedTokens || null);
  // Extract base64 image or URL from response
  const message = data.choices?.[0]?.message;
  const imageUrl = message?.images?.[0]?.image_url?.url || message?.images?.[0]?.imageUrl?.url || "";
  const imageContent = `${imageUrl}\n${message?.content || ""}`;
  const base64Match = imageContent.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
  const urlMatch = imageContent.match(/https?:\/\/[^\s"'\)]+\.(png|jpg|jpeg|webp|gif)/i);

  let imageBuffer: Buffer | null = null;

  if (base64Match) {
    imageBuffer = Buffer.from(base64Match[1], "base64");
  } else if (urlMatch) {
    const imgResp = await fetch(urlMatch[0], { signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS) });
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
    cost: openRouterUsage.cost,
    latencyMs: Date.now() - startedAt,
    sessionId: jobId,
    responseData: { id: data.id, generation: openRouterUsage.stats },
  });

  if (!imageBuffer) return { storagePath: null, cost: openRouterUsage.cost };

  try {
    const sharp = (await import("sharp")).default;
    imageBuffer = (await sharp(imageBuffer).webp({ quality: compressionEnabled ? 85 : 100 }).toBuffer()) as any;
  } catch {}

  const finalImageBuffer = imageBuffer;
  if (!finalImageBuffer) return { storagePath: null, cost: openRouterUsage.cost };

  const { storagePath } = await saveImageBuffer(finalImageBuffer, userId, {
    type,
    prompt,
    altText,
    modelId,
    provider: "openrouter-image",
    aspectRatio,
    resolution,
    position,
    cost: openRouterUsage.cost,
    jobId,
    postId: postId || undefined,
  });

  return { storagePath, cost: openRouterUsage.cost };
}

function openAiSize(aspectRatio: string) {
  if (["2:3", "3:4", "4:5", "9:16"].includes(aspectRatio)) return "1024x1536";
  if (["3:2", "4:3", "5:4", "16:9", "21:9"].includes(aspectRatio)) return "1536x1024";
  return "1024x1024";
}

async function saveProviderImageBuffer(
  imageBuffer: Buffer<ArrayBufferLike>,
  opts: {
    userId: string;
    jobId: string;
    type: string;
    position: number;
    prompt: string;
    altText: string;
    modelId: string;
    provider: string;
    aspectRatio: string;
    resolution: string;
    compressionEnabled: boolean;
    postId?: string | null;
    cost?: number;
  }
) {
  try {
    const sharp = (await import("sharp")).default;
    imageBuffer = await sharp(imageBuffer).webp({ quality: opts.compressionEnabled ? 85 : 100 }).toBuffer();
  } catch {}

  const { storagePath } = await saveImageBuffer(imageBuffer, opts.userId, {
    type: opts.type,
    prompt: opts.prompt,
    altText: opts.altText,
    modelId: opts.modelId,
    provider: opts.provider,
    aspectRatio: opts.aspectRatio,
    resolution: opts.resolution,
    position: opts.position,
    cost: opts.cost || 0,
    jobId: opts.jobId,
    postId: opts.postId || undefined,
  });

  return { storagePath, cost: 0 };
}

async function generateWithOpenAI(
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
  compressionEnabled: boolean,
  openAiKey: string
): Promise<{ storagePath: string; cost: number } | null> {
  const startedAt = Date.now();
  const model = modelId.replace("openai/", "");
  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: openAiSize(aspectRatio),
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => "");
    console.error(`[image] OpenAI error: ${resp.status} ${errText}`);
    return null;
  }

  const data = await resp.json() as any;
  const item = data.data?.[0];
  let imageBuffer: Buffer<ArrayBufferLike> | null = item?.b64_json ? Buffer.from(item.b64_json, "base64") : null;
  if (!imageBuffer && item?.url) {
    const imgResp = await fetch(item.url, { signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS) });
    if (imgResp.ok) imageBuffer = Buffer.from(await imgResp.arrayBuffer());
  }

  await db.insert(generationLogs).values({
    userId,
    postId,
    usageType: "image",
    modelId,
    provider: "openai-image",
    status: imageBuffer ? "success" : "failed",
    latencyMs: Date.now() - startedAt,
    sessionId: jobId,
    responseData: { created: data.created, usage: data.usage },
  });

  if (!imageBuffer) return null;
  return saveProviderImageBuffer(imageBuffer, { userId, jobId, type, position, postId, prompt, altText, modelId, provider: "openai-image", aspectRatio, resolution, compressionEnabled });
}

function replicateAspectRatio(aspectRatio: string) {
  return ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16"].includes(aspectRatio) ? aspectRatio : "1:1";
}

async function generateWithReplicate(
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
  compressionEnabled: boolean,
  replicateKey: string
): Promise<{ storagePath: string; cost: number } | null> {
  const startedAt = Date.now();
  const [, owner, model] = modelId.split("/");
  if (!owner || !model) throw new Error("Invalid Replicate model id");

  const createResp = await fetch(`https://api.replicate.com/v1/models/${owner}/${model}/predictions`, {
    method: "POST",
    signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${replicateKey}`,
      "Content-Type": "application/json",
      Prefer: "wait=10",
    },
    body: JSON.stringify({
      input: {
        prompt,
        aspect_ratio: replicateAspectRatio(aspectRatio),
        output_format: "webp",
      },
    }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text().catch(() => "");
    console.error(`[image] Replicate error: ${createResp.status} ${errText}`);
    return null;
  }

  let prediction = await createResp.json() as any;
  const deadline = Date.now() + 60_000;
  while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled" && prediction.urls?.get && Date.now() < deadline) {
    await sleep(1500);
    const pollResp = await fetch(prediction.urls.get, {
      signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${replicateKey}` },
    });
    if (!pollResp.ok) break;
    prediction = await pollResp.json() as any;
  }

  const output = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
  const imageUrl = typeof output === "string" ? output : output?.url;
  let imageBuffer: Buffer<ArrayBufferLike> | null = null;
  if (prediction.status === "succeeded" && imageUrl) {
    const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS) });
    if (imgResp.ok) imageBuffer = Buffer.from(await imgResp.arrayBuffer());
  }

  await db.insert(generationLogs).values({
    userId,
    postId,
    usageType: "image",
    modelId,
    provider: "replicate-image",
    status: imageBuffer ? "success" : "failed",
    latencyMs: Date.now() - startedAt,
    sessionId: jobId,
    responseData: { id: prediction.id, status: prediction.status, metrics: prediction.metrics },
  });

  if (!imageBuffer) return null;
  return saveProviderImageBuffer(imageBuffer, { userId, jobId, type, position, postId, prompt, altText, modelId, provider: "replicate-image", aspectRatio, resolution, compressionEnabled });
}

async function generateWithGoogleAI(
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
  compressionEnabled: boolean,
  googleAiKey: string
): Promise<{ storagePath: string; cost: number } | null> {
  const geminiModel = modelId.replace("google-ai-studio/", "");
  const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${googleAiKey}`, {
    method: "POST",
    signal: AbortSignal.timeout(IMAGE_REQUEST_TIMEOUT_MS),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
  });

  if (!resp.ok) return null;

  const data = await resp.json() as any;
  const parts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = parts.find((p: any) => p.inlineData?.mimeType?.startsWith("image/"));

  if (!imagePart) return null;

  let imageBuffer = Buffer.from(imagePart.inlineData.data, "base64");

  try {
    const sharp = (await import("sharp")).default;
    imageBuffer = (await sharp(imageBuffer).webp({ quality: compressionEnabled ? 85 : 100 }).toBuffer()) as any;
  } catch {}

  await db.insert(generationLogs).values({
    userId,
    postId,
    usageType: "image",
    modelId,
    provider: "google-ai-studio",
    status: "success",
    cost: 0.04,
    sessionId: jobId,
    responseData: { usage: data.usage },
  });

  const { storagePath } = await saveImageBuffer(imageBuffer, userId, {
    type,
    prompt,
    altText,
    modelId,
    provider: "google-ai-studio",
    aspectRatio,
    resolution,
    position,
    cost: 0.04,
    jobId,
    postId: postId || undefined,
  });

  return { storagePath, cost: 0.04 };
}
