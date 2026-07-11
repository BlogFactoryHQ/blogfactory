import { cleanPostTitle } from "./post-cleanup.js";
import { buildVoiceContentInstructions } from "./voice-content.js";
import { retrieveKnowledgeChunks } from "./knowledge.js";
import type { GenerateOpts, GenerationSettings } from "./generation-types.js";

export const FAQ_TARGET: [number, number] = [3, 5];
export const INTERNAL_LINK_TARGETS: Record<string, [number, number]> = {
  minimal: [1, 2],
  light: [3, 4],
  balanced: [5, 7],
  rich: [8, 12],
};

const ARTICLE_TYPES = new Set(["auto", "how_to", "list", "what_is", "pillar", "alternatives", "best_of", "comparison", "newsjacking"]);

export function truncatePromptText(value: string, maxChars = 1200) {
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

export function tokenize(value: string) {
  return new Set(value.toLowerCase().match(/[a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi) || []);
}

export function normalizeTopic(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function topicCoveredByText(topic: string, text: string) {
  const normalizedTopic = normalizeTopic(topic);
  const normalizedText = normalizeTopic(text);
  return normalizedTopic.length >= 8 && normalizedText.includes(normalizedTopic);
}

type InternalLinkPromptPage = { url?: string; title?: string; description?: string; path?: string; embedding?: number[] };

export function settingValue(settings: GenerationSettings | undefined, camel: string, snake: string = camel) {
  return settings?.[camel] ?? settings?.[snake];
}

export function settingBool(settings: GenerationSettings | undefined, camel: string, snake: string = camel) {
  return settingValue(settings, camel, snake) === true;
}

export function settingNumber(settings: GenerationSettings | undefined, camel: string, snake: string = camel) {
  const number = Number(settingValue(settings, camel, snake));
  return Number.isFinite(number) ? number : undefined;
}

export function findIndexedTopicDuplicate(settings: GenerationSettings | undefined, topic: string) {
  const index = settingValue(settings, "internalLinkIndex", "internal_link_index") as { pages?: InternalLinkPromptPage[] } | null | undefined;
  const pages = Array.isArray(index?.pages) ? index.pages : [];
  return pages.find((page) => topicCoveredByText(topic, `${page.title || ""} ${page.path || ""} ${page.url || ""}`)) || null;
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

export function normalizeList(value: unknown, maxItems = 5) {
  const items = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return items.map((item) => String(item).trim()).filter(Boolean).slice(0, maxItems);
}

export function articleType(value: unknown) {
  const type = typeof value === "string" ? value.trim() : "";
  return ARTICLE_TYPES.has(type) ? type : "auto";
}

export function internalLinkTarget(settings?: GenerationSettings): [number, number] | null {
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
  return {
    targetWords,
    minWords: targetWords ? Math.round(targetWords * 0.8) : null,
    maxWords: targetWords ? Math.round(targetWords * 1.2) : null,
    faqTarget: FAQ_TARGET,
    internalLinkDensity: INTERNAL_LINK_TARGETS[linkDensity] ? linkDensity : "balanced",
    internalLinkTarget: internalLinkTarget(settings),
  };
}

export type GenerationContract = ReturnType<typeof resolveGenerationContract>;

export function articleTemplateInstructions(value: unknown) {
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
  return templates[articleType(value)];
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
  if (contract.targetWords && contract.minWords && contract.maxWords) lines.push(`Target article length: about ${contract.targetWords} words; acceptable range ${contract.minWords}-${contract.maxWords} words.`);
  lines.push("If the topic has realistic reader follow-up questions, include a concise FAQ with specific answers; skip FAQ rather than adding generic filler.");
  lines.push("Do not pad the article with repeated sentences or meta notes about the content. Every paragraph must end with a complete sentence.");
  if (opts.includeTableOfContents === true) lines.push("Include a concise table of contents near the beginning.");
  if (opts.enableResearch === true) lines.push("Add useful research context, examples, and clearly explained claims.");
  if (outline) lines.push(`Use this outline as the article structure:\n${outline}`);
  if (direction) lines.push(`Unique angle or proprietary insight to include: ${direction}`);
  if (customInstructions) lines.push(`Custom instructions: ${truncatePromptText(customInstructions, 1500)}`);
  return lines.length ? `\n\nAdditional article instructions:\n${lines.join("\n\n")}` : "";
}
