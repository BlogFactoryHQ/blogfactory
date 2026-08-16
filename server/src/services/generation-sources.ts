import type { GenerateOpts, SourceArticle } from "./generation-types.js";

const FEED_SOURCE_TYPES = new Set(["rss_feed", "reddit", "hackernews", "github"]);
export const BLOG_DRAFT_SOURCE_TYPES = ["article_keyword", "article_title", "url", "raw_text", "youtube", "pdf", "rss_feed", "reddit", "hackernews", "github", "campaign"] as const;
const BLOG_DRAFT_SOURCE_TYPE_SET = new Set<string>(BLOG_DRAFT_SOURCE_TYPES);
const RSS_FETCH_TIMEOUT_MS = 15_000;

export function isArticleSource(sourceType: string) {
  return sourceType === "article_keyword" || sourceType === "article_title";
}

export function isFeedSource(sourceType: string) {
  return FEED_SOURCE_TYPES.has(sourceType);
}

export function isBlogDraftSource(sourceType: string) {
  return BLOG_DRAFT_SOURCE_TYPE_SET.has(sourceType);
}

function supportsDraftVariations(sourceType: string) {
  return ["article_keyword", "article_title", "url", "raw_text", "youtube", "pdf"].includes(sourceType);
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

export function feedItemOffset(value: unknown) {
  const offset = Math.floor(Number(value));
  return Number.isFinite(offset) && offset > 0 ? Math.min(offset, 100) : 0;
}

export function expandDraftVariations(
  articles: SourceArticle[],
  sourceType: string,
  requested: unknown,
  singleDraft?: { index?: number; count?: number },
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
    })),
  );
}

export function hashContent(content: string) {
  const data = new TextEncoder().encode(content);
  let hash = 0;
  for (let index = 0; index < data.length; index += 1) {
    hash = ((hash << 5) - hash + data[index]) | 0;
  }
  return Math.abs(hash).toString(36);
}

interface FeedDuplicateDependencies {
  contentHash: (article: SourceArticle, opts: GenerateOpts) => string;
  sourceUrlExists: (url: string) => Promise<boolean>;
  contentHashExists: (hash: string) => Promise<boolean>;
}

export async function filterNewFeedArticles(
  articles: SourceArticle[],
  effectiveOpts: GenerateOpts,
  requestedCount: number,
  dependencies: FeedDuplicateDependencies,
) {
  const selected: SourceArticle[] = [];
  const skipped: Array<{ title: string; url?: string; reason: string }> = [];
  const seenHashes = new Set<string>();

  for (const article of articles) {
    const contentHash = dependencies.contentHash(article, effectiveOpts);
    if (seenHashes.has(contentHash)) {
      skipped.push({ title: article.title || "Untitled", url: article.url, reason: "Duplicate in fetched source batch" });
      continue;
    }
    seenHashes.add(contentHash);

    if (article.url && await dependencies.sourceUrlExists(article.url)) {
      skipped.push({ title: article.title || "Untitled", url: article.url, reason: "Source URL already generated" });
      continue;
    }
    if (await dependencies.contentHashExists(contentHash)) {
      skipped.push({ title: article.title || "Untitled", url: article.url, reason: "Already generated" });
      continue;
    }

    selected.push(article);
    if (selected.length >= requestedCount) break;
  }

  return { articles: selected, skipped };
}

interface ExtractedArticle {
  title?: string | null;
  content?: string | null;
}

export async function hydrateFeedArticlesWithFullText(
  articles: SourceArticle[],
  extract: (article: SourceArticle) => Promise<ExtractedArticle>,
  onError: (article: SourceArticle, error: unknown) => void = () => undefined,
) {
  const hydrated: SourceArticle[] = [];
  for (const article of articles) {
    if (!article.url || !/^https?:\/\//i.test(article.url)) {
      hydrated.push(article);
      continue;
    }
    try {
      const extracted = await extract(article);
      const extractedContent = (extracted.content || "").trim();
      hydrated.push({
        ...article,
        title: extracted.title || article.title,
        content: extractedContent.length > article.content.length ? extractedContent : article.content,
      });
    } catch (error) {
      onError(article, error);
      hydrated.push(article);
    }
  }
  return hydrated;
}

function extractTag(xml: string, tag: string) {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i").exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return match ? match[1].trim() : "";
}

function extractAttr(xml: string, tag: string, attr: string) {
  const match = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i").exec(xml);
  return match ? match[1] : "";
}

function extractCategories(xml: string) {
  return [...xml.matchAll(/<category\b([^>]*?)(?:\/>|>([\s\S]*?)<\/category>)/gi)]
    .map((match) => match[1].match(/\bterm=["']([^"']+)["']/i)?.[1] || match[2]?.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/)?.[1] || stripHtml(match[2] || ""))
    .map((category) => stripHtml(category).trim())
    .filter((category, index, categories) => Boolean(category) && categories.indexOf(category) === index);
}

function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function fetchRssArticles(
  feedUrl: string,
  limit: number,
  filterOldDays?: number,
  keywords: string[] = [],
  fetcher: typeof fetch = fetch,
) {
  try {
    const response = await fetcher(feedUrl, { signal: AbortSignal.timeout(RSS_FETCH_TIMEOUT_MS) });
    const text = await response.text();
    const articles: SourceArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    const regex = text.includes("<entry>") ? entryRegex : itemRegex;
    const keywordNeedles = keywords.map((keyword) => keyword.toLowerCase()).filter(Boolean);
    const maxScan = Math.max(50, Math.min(200, limit * 5));
    let match: RegExpExecArray | null;
    let scanned = 0;

    while ((match = regex.exec(text)) !== null && scanned < maxScan) {
      scanned += 1;
      const itemXml = match[1];
      const title = extractTag(itemXml, "title");
      const link = extractTag(itemXml, "link") || extractAttr(itemXml, "link", "href");
      const description = extractTag(itemXml, "description") || extractTag(itemXml, "summary") || extractTag(itemXml, "content:encoded") || extractTag(itemXml, "content");
      const pubDate = extractTag(itemXml, "pubDate") || extractTag(itemXml, "published") || extractTag(itemXml, "updated");
      const tags = extractCategories(itemXml);
      const content = stripHtml(description || "");
      if (keywordNeedles.length && !keywordNeedles.some((keyword) => `${title} ${content}`.toLowerCase().includes(keyword))) continue;
      if (filterOldDays && pubDate) {
        const cutoff = new Date(Date.now() - filterOldDays * 24 * 60 * 60 * 1000);
        if (new Date(pubDate) < cutoff) continue;
      }
      articles.push({ title: title || "Untitled", content, url: link || undefined, pubDate: pubDate || undefined, ...(tags.length ? { tags } : {}) });
    }

    return articles
      .sort((left, right) => left.pubDate && right.pubDate ? new Date(right.pubDate).getTime() - new Date(left.pubDate).getTime() : 0)
      .slice(0, limit);
  } catch (error) {
    console.error("[generate] RSS fetch error:", error);
    return [];
  }
}
