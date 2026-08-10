import { cleanPostTitle } from "./post-cleanup.js";
import {
  articleType,
  internalLinkTarget,
  normalizeTopic,
  resolveGenerationContract,
  settingValue,
  tokenize,
  truncatePromptText,
} from "./generation-contracts.js";
import type { GenerateOpts, GenerationSettings, SeoQaCheck } from "./generation-types.js";
import { isBlogDraftSource } from "./generation-sources.js";

const GENERATED_TITLE_MAX_CHARS = 160;
const GENERATED_TITLE_MAX_WORDS = 24;

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


type InternalLinkPromptPage = { url?: string; title?: string; description?: string; path?: string; embedding?: number[] };

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


export function promptSpecifiesLanguage(prompt: string) {
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

export function requestedOutputLanguage(personaPrompt: string, settings?: GenerationSettings) {
  const personaLanguage = languageFromPrompt(personaPrompt);
  if (personaLanguage) return personaLanguage;
  return String(settingValue(settings, "articleLanguage", "article_language") || "").trim();
}

export function outputLanguageInstruction(language: string) {
  if (!language) return "";
  if (/turkish|türkçe/i.test(language)) {
    return "Output language: Turkish. Write the entire article in natural Turkish, including the H1, headings, body, conclusion, and FAQ text.";
  }
  return `Output language: ${language}. Write the entire article in ${language}, including headings and FAQ text.`;
}

export function looksLikeRequestedLanguage(content: string, language: string) {
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

export function personaLanguagePriorityInstruction(personaPrompt: string) {
  if (!promptSpecifiesLanguage(personaPrompt)) return "";
  return "\n\nPersona language priority: The selected writer persona explicitly defines the output language. Follow that persona language instruction exactly, even if global article settings have a different default language.";
}


export function enforceGeneratedArticleContracts(content: string, opts: { sourceType: string; topic: string; settings?: GenerationSettings }) {
  let next = normalizeArticleMarkdown(content, opts.topic, opts.settings);
  next = stripInternalSeoSections(next);
  next = normalizeGeneratedStructure(next);
  if (isBlogDraftSource(opts.sourceType)) next = ensureSectionHeadings(next, opts.topic, opts.settings);
  next = ensureInternalMarkdownLinks(next, opts.settings);
  return next;
}

function normalizeArticleMarkdown(content: string, topic: string, settings?: GenerationSettings) {
  const next = content.trim();
  const h1 = next.match(/^#\s+(.+)$/m);
  if (h1) {
    const currentTitle = h1[1].trim();
    if (!isPlausibleGeneratedTitle(currentTitle)) {
      return next.replace(/^#\s+.+$/m, `# ${safeGeneratedTitle(topic)}`);
    }
    if (shouldLocalizeTitle(currentTitle, next, settings)) {
      const localizedTitle = titleFromTurkishBody(next, topic);
      return next
        .replace(/^#\s+.+$/m, `# ${localizedTitle}`)
        .replace(new RegExp(`\\n{2,}${escapeRegExp(localizedTitle)}\\s*(?=\\n{2,})`, "i"), "");
    }
    return next;
  }
  const openingTitle = openingPlainTitle(next);
  if (openingTitle) {
    const firstBlock = next.split(/\n{2,}/, 1)[0];
    const body = next.slice(firstBlock.length).trim();
    return body ? `# ${openingTitle}\n\n${body}` : `# ${openingTitle}`;
  }
  return `# ${safeGeneratedTitle(topic)}\n\n${next}`;
}

function titleCandidate(value: string) {
  return cleanPostTitle(value
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\*\*([^*]+)\*\*$/, "$1")
    .replace(/^title:\s*/i, ""));
}

function isPlausibleGeneratedTitle(value: string) {
  const title = titleCandidate(value);
  return Boolean(title)
    && title.length <= GENERATED_TITLE_MAX_CHARS
    && wordCount(title) <= GENERATED_TITLE_MAX_WORDS
    && !title.includes("\n");
}

function openingPlainTitle(content: string) {
  const firstBlock = content.split(/\n{2,}/, 1)[0]?.trim() || "";
  if (!firstBlock || firstBlock.includes("\n") || /^#{1,6}\s|^[-*|>]\s/.test(firstBlock) || /\.$/.test(firstBlock)) return "";
  const title = titleCandidate(firstBlock);
  return isPlausibleGeneratedTitle(title) ? title : "";
}

function safeGeneratedTitle(value: string) {
  const firstLine = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || "Untitled Post";
  return truncateAtWord(titleCandidate(firstLine) || "Untitled Post", GENERATED_TITLE_MAX_CHARS);
}

export function generatedPostTitle(content: string, fallback = "Untitled Post") {
  const h1 = content.match(/^#\s+(.+)$/m)?.[1] || "";
  return isPlausibleGeneratedTitle(h1) ? titleCandidate(h1) : safeGeneratedTitle(fallback);
}

function normalizeGeneratedStructure(content: string) {
  const blocks = content.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const normalized: string[] = [];
  let inFaq = false;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const heading = block.match(/^##\s+(.+)$/);
    if (heading && plainArticleText(blocks[index + 1] || "").toLowerCase().startsWith(plainArticleText(heading[1]).toLowerCase())) continue;
    if (/^#{1,6}\s+/.test(block)) {
      normalized.push(block);
      inFaq = Boolean(heading && /^(sık(?:ça)? sorulan sorular|sss|faq|faqs)$/i.test(heading[1]));
      continue;
    }

    const boldHeading = block.match(/^\*\*([^*\n]+)\*\*$/);
    const plainHeading = !/[.!?]$/.test(block) && !block.includes("\n") && wordCount(block) <= 12 ? block : "";
    const headingText = boldHeading?.[1].trim() || plainHeading;
    if (headingText) {
      const faq = /^(sık(?:ça)? sorulan sorular|sss|faq|faqs)$/i.test(headingText);
      normalized.push(`## ${faq ? "Sık Sorulan Sorular" : headingText}`);
      inFaq = faq;
      continue;
    }

    if (inFaq) {
      const faqItem = block.match(/^(.{5,160}\?)\s+([\s\S]+)$/);
      if (faqItem) {
        normalized.push(`### ${faqItem[1].trim()}\n${faqItem[2].trim()}`);
        continue;
      }
    }

    normalized.push(block);
  }

  return normalized.join("\n\n");
}

function shouldLocalizeTitle(title: string, content: string, settings?: GenerationSettings) {
  return isTurkishContent(content, settings) && !/[ğüşöçıİĞÜŞÖÇ]/.test(title);
}

function titleFromTurkishBody(content: string, topic: string) {
  const withoutTitle = content.replace(/^#\s+.+\n*/m, "");
  const blocks = withoutTitle.split(/\n{2,}/).map(plainArticleText).filter(Boolean);
  const titleBlock = blocks[0] && blocks.length > 1 && blocks[0].length <= 120 && !/[.!]$/.test(blocks[0]) ? blocks[0] : "";
  const sentence = titleBlock || plainArticleText(withoutTitle).split(/(?<=[.!?])\s+/)[0] || topic;
  let polished = sentence
    .replace(/\bkarşılaştığı temel engellerden biri\b.*$/i, "önündeki temel engeller")
    .replace(/\bkarşılaştığı temel engeller\b.*$/i, "karşılaştığı temel engeller")
    .trim();
  if (!titleBlock) polished = polished.replace(/,\s+.*$/, "").trim();
  return truncateAtWord(cleanPostTitle(polished || topic), 90) || cleanPostTitle(topic || "Untitled Post");
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
  const outputLanguage = requestedLanguage || (looksLikeRequestedLanguage(content, "Turkish") ? "Turkish" : "");
  if (outputLanguage && looksLikeRequestedLanguage(content, outputLanguage) && !looksLikeRequestedLanguage(title, outputLanguage)) {
    return content;
  }
  const h1 = content.match(/^#\s+(.+)$/m);
  if (h1 && titleMatchesSourceTitle(h1[1], title)) return content;
  if (h1) return content.replace(/^#\s+.+$/m, `# ${title}`);
  return `# ${title}\n\n${content}`;
}

export function truncateAtWord(value: string, maxChars: number) {
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


function markdownSection(content: string, heading: string) {
  const pattern = new RegExp(`^##\\s+(?:${heading})\\s*\\n+([\\s\\S]*?)(?=\\n##\\s+|\\n#\\s+|$)`, "im");
  return (content.match(pattern)?.[1] || "").replace(/^`|`$/g, "").trim();
}

function markdownHeadings(content: string, level: 2 | 3) {
  const pattern = new RegExp(`^#{${level}}\\s+(.+)$`, "gm");
  return Array.from(content.matchAll(pattern)).map((match) => match[1].trim());
}

export function wordCount(content: string) {
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
  const h1 = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
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

export function plainText(value: string, maxChars = 900) {
  return value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[[^\]]+]\([^)]+\)/g, (match) => match.replace(/^\[|\]\([^)]+\)$/g, ""))
    .replace(/[#*_>`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxChars);
}
