interface IndexedPage {
  url: string;
  title: string;
  description?: string;
  path: string;
  embedding?: number[];
}

export interface InternalLinkIndex {
  sitemapUrl: string;
  siteHost: string;
  pageCount: number;
  vectorCount: number;
  pages: IndexedPage[];
  createdAt: string;
  sitemapSource?: "provided" | "standard" | "robots";
  sitemapRedirected?: boolean;
  sitemapMessages?: string[];
}

interface InternalLinkIndexOptions {
  mode?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
  openAiKey?: string | null;
  onProgress?: (state: Partial<InternalLinkIndexingState>) => Promise<void> | void;
}

export interface InternalLinkIndexingState {
  jobId?: string;
  step: "queued" | "fetch_sitemap" | "crawl_pages" | "create_embeddings" | "build_index" | "completed" | "failed";
  totalPages: number;
  crawledPages: number;
  embeddedPages: number;
  errorMessage?: string | null;
  startedAt?: string;
  completedAt?: string | null;
}

const MAX_SITEMAPS = 12;
const MAX_PAGES = 150;
const PAGE_FETCH_CONCURRENCY = 8;
const EMBEDDING_BATCH_SIZE = 24;
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 512;
export const INTERNAL_LINK_REFRESH_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

interface FetchedText {
  text: string;
  finalUrl: string;
  contentType: string;
}

interface SitemapCandidate {
  url: string;
  source: "provided" | "standard" | "robots";
}

interface SitemapDiscovery {
  sitemapUrl: string;
  source: "provided" | "standard" | "robots";
  redirected: boolean;
  siteHost: string;
  rootHost: string;
  messages: string[];
}

interface CrawledPage extends IndexedPage {
  text: string;
}

export function canRefreshInternalLinks(lastSyncedAt: string | Date | null | undefined, now = new Date()) {
  if (!lastSyncedAt) return true;
  return now.getTime() - new Date(lastSyncedAt).getTime() >= INTERNAL_LINK_REFRESH_COOLDOWN_MS;
}

export function nextInternalLinkRefreshAt(lastSyncedAt: string | Date | null | undefined) {
  if (!lastSyncedAt) return null;
  return new Date(new Date(lastSyncedAt).getTime() + INTERNAL_LINK_REFRESH_COOLDOWN_MS);
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host.startsWith("10.") || host.startsWith("192.168.") || host.startsWith("169.254.")) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
  if (host.includes("metadata.google") || host.includes("instance-data")) return true;
  return false;
}

function comparableHost(hostname: string) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function isSameSiteHost(hostname: string, expectedRootHost: string) {
  return comparableHost(hostname) === comparableHost(expectedRootHost);
}

function normalizeInputUrl(input: string): URL {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Sitemap URL is required");

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(withProtocol);

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only HTTP and HTTPS sitemap URLs are allowed");
  }
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("Private or internal sitemap URLs are not allowed");
  }

  return parsed;
}

function looksLikeSitemapPath(pathname: string) {
  return /(^|\/)sitemap[^/]*\.xml$/i.test(pathname) || pathname.toLowerCase().includes("sitemap");
}

function standardSitemapUrl(url: URL) {
  const sitemapUrl = new URL(url.origin);
  sitemapUrl.pathname = "/sitemap.xml";
  sitemapUrl.search = "";
  sitemapUrl.hash = "";
  return sitemapUrl.toString();
}

function robotsUrl(url: URL) {
  const robots = new URL(url.origin);
  robots.pathname = "/robots.txt";
  robots.search = "";
  robots.hash = "";
  return robots.toString();
}

function alternateWwwUrl(url: URL) {
  const alternate = new URL(url.toString());
  if (alternate.hostname.startsWith("www.")) {
    alternate.hostname = alternate.hostname.replace(/^www\./, "");
  } else if (alternate.hostname.split(".").length >= 2) {
    alternate.hostname = `www.${alternate.hostname}`;
  }
  return alternate.hostname === url.hostname ? null : alternate;
}

async function fetchText(url: string, timeoutMs = 10000): Promise<FetchedText> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "BlogFactoryBot/1.0 (+https://blogfactory.io)",
        Accept: "application/xml,text/xml,text/html,*/*",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Fetch failed with ${response.status}`);
    return {
      text: await response.text(),
      finalUrl: response.url || url,
      contentType: response.headers.get("content-type") || "",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .trim();
}

function extractLocs(xml: string) {
  const locs: string[] = [];
  const regex = /<loc[^>]*>([\s\S]*?)<\/loc>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const loc = decodeXml(match[1]);
    if (loc) locs.push(loc);
  }
  return locs;
}

function isSitemapIndex(xml: string) {
  return /<sitemapindex[\s>]/i.test(xml);
}

function isUrlset(xml: string) {
  return /<urlset[\s>]/i.test(xml);
}

function parseRobotsSitemaps(robots: string) {
  const sitemaps: string[] = [];
  const regex = /^sitemap:\s*(\S+)/gim;
  let match;
  while ((match = regex.exec(robots)) !== null) {
    sitemaps.push(match[1].trim());
  }
  return sitemaps;
}

async function buildSitemapCandidates(inputUrl: URL, rootHost: string): Promise<SitemapCandidate[]> {
  const candidates: SitemapCandidate[] = [];
  const addCandidate = (url: string, source: SitemapCandidate["source"]) => {
    try {
      const parsed = new URL(url);
      if (!["http:", "https:"].includes(parsed.protocol)) return;
      if (isPrivateHost(parsed.hostname)) return;
      if (!isSameSiteHost(parsed.hostname, rootHost)) return;
      if (!candidates.some((candidate) => candidate.url === parsed.toString())) {
        candidates.push({ url: parsed.toString(), source });
      }
    } catch {
      // Ignore malformed sitemap hints.
    }
  };

  if (looksLikeSitemapPath(inputUrl.pathname)) {
    addCandidate(inputUrl.toString(), "provided");
  } else {
    addCandidate(standardSitemapUrl(inputUrl), "standard");
  }

  for (const baseUrl of [inputUrl, alternateWwwUrl(inputUrl)].filter((url): url is URL => Boolean(url))) {
    if (!isSameSiteHost(baseUrl.hostname, rootHost)) continue;
    addCandidate(standardSitemapUrl(baseUrl), "standard");
    try {
      const robots = await fetchText(robotsUrl(baseUrl), 5000);
      for (const sitemapUrl of parseRobotsSitemaps(robots.text)) {
        addCandidate(sitemapUrl, "robots");
      }
    } catch {
      // robots.txt is optional; standard sitemap probing continues without it.
    }
  }

  return candidates;
}

async function discoverSitemap(input: string): Promise<SitemapDiscovery> {
  const inputUrl = normalizeInputUrl(input);
  const rootHost = comparableHost(inputUrl.hostname);
  const messages: string[] = [];
  const candidates = await buildSitemapCandidates(inputUrl, rootHost);

  for (const candidate of candidates) {
    try {
      const fetched = await fetchText(candidate.url);
      const locs = extractLocs(fetched.text);
      const final = new URL(fetched.finalUrl);
      if (!isSameSiteHost(final.hostname, rootHost)) {
        messages.push(`Skipped ${candidate.url}: redirected outside this site`);
        continue;
      }
      if (locs.length === 0 || (!isUrlset(fetched.text) && !isSitemapIndex(fetched.text))) {
        messages.push(`Skipped ${candidate.url}: no sitemap entries found`);
        continue;
      }

      return {
        sitemapUrl: final.toString(),
        source: candidate.source,
        redirected: final.toString() !== candidate.url,
        siteHost: rootHost,
        rootHost,
        messages: [
          ...messages,
          candidate.source === "robots" ? "Sitemap discovered from robots.txt" : "Sitemap discovered at standard location",
          final.toString() !== candidate.url ? `Sitemap redirected to ${final.toString()}` : "Sitemap loaded without redirect",
          `${locs.length} sitemap entr${locs.length === 1 ? "y" : "ies"} found`,
        ],
      };
    } catch (err: any) {
      messages.push(`Skipped ${candidate.url}: ${err.message || "fetch failed"}`);
    }
  }

  throw new Error(messages.length ? `No sitemap found. ${messages.join("; ")}` : "No sitemap found at standard locations");
}

async function collectSitemapUrls(url: string, expectedRootHost: string, seen = new Set<string>()): Promise<string[]> {
  if (seen.size >= MAX_SITEMAPS || seen.has(url)) return [];
  seen.add(url);

  const fetched = await fetchText(url);
  const finalUrl = new URL(fetched.finalUrl);
  if (!isSameSiteHost(finalUrl.hostname, expectedRootHost)) return [];

  const locs = extractLocs(fetched.text);

  if (isSitemapIndex(fetched.text)) {
    const nested: string[] = [];
    for (const loc of locs.slice(0, MAX_SITEMAPS)) {
      try {
        const parsed = new URL(loc);
        if (!isSameSiteHost(parsed.hostname, expectedRootHost)) continue;
        nested.push(...await collectSitemapUrls(parsed.toString(), expectedRootHost, seen));
      } catch (err) {
        console.warn("[internal-linking] Skipping nested sitemap:", loc, err);
      }
      if (nested.length >= MAX_PAGES) break;
    }
    return nested.slice(0, MAX_PAGES);
  }

  return locs.slice(0, MAX_PAGES);
}

function titleFromUrl(url: URL) {
  const last = url.pathname.split("/").filter(Boolean).pop() || url.hostname;
  return decodeURIComponent(last)
    .replace(/\.(html?|php|aspx?)$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function extractMainText(html: string) {
  const main =
    html.match(/<article[\s\S]*?<\/article>/i)?.[0] ||
    html.match(/<main[\s\S]*?<\/main>/i)?.[0] ||
    html.match(/<body[\s\S]*?<\/body>/i)?.[0] ||
    html;

  return stripHtml(decodeXml(main))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
}

function extractMeta(html: string, name: string) {
  const regex = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i");
  return html.match(regex)?.[1]?.trim();
}

function extractTitle(html: string) {
  const ogTitle = extractMeta(html, "og:title");
  if (ogTitle) return stripHtml(decodeXml(ogTitle));
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? stripHtml(decodeXml(title)) : "";
}

async function indexPage(url: string): Promise<CrawledPage | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol) || isPrivateHost(parsed.hostname)) return null;
  } catch {
    return null;
  }

  try {
    const { text: html } = await fetchText(url, 5000);
    const title = extractTitle(html) || titleFromUrl(parsed);
    const description = stripHtml(decodeXml(
      extractMeta(html, "description") || extractMeta(html, "og:description") || ""
    )).slice(0, 240);
    const mainText = extractMainText(html);

    return {
      url: parsed.toString(),
      title,
      description: description || undefined,
      path: parsed.pathname,
      text: mainText || `${title} ${description || ""} ${parsed.pathname}`.trim(),
    };
  } catch {
    return {
      url: parsed.toString(),
      title: titleFromUrl(parsed),
      path: parsed.pathname,
      text: titleFromUrl(parsed),
    };
  }
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
  afterEach?: (result: R) => Promise<void> | void
) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const result = await mapper(items[index]);
      results[index] = result;
      await afterEach?.(result);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export function normalizeVector(vector: number[]) {
  const length = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (!length) return vector;
  return vector.map((value) => value / length);
}

export function cosineSimilarity(a: number[] | undefined, b: number[] | undefined) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let sum = 0;
  for (let i = 0; i < a.length; i += 1) sum += a[i] * b[i];
  return sum;
}

function pageEmbeddingInput(page: CrawledPage) {
  return `${page.title}\n${page.description || ""}\n${page.path}\n${page.text}`.slice(0, 7000);
}

async function embedTexts(texts: string[], openAiKey: string) {
  if (texts.length === 0) return [];

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `OpenAI embeddings failed with ${response.status}`);
  }

  const data = await response.json() as { data?: Array<{ embedding?: number[]; index?: number }> };
  const embeddings = data.data || [];
  return texts.map((_, index) => {
    const embedding = embeddings.find((item) => item.index === index)?.embedding || embeddings[index]?.embedding;
    if (!embedding) throw new Error("OpenAI embeddings response was missing a vector");
    return normalizeVector(embedding);
  });
}

export async function embedInternalLinkText(text: string, openAiKey: string) {
  const [embedding] = await embedTexts([text.slice(0, 7000)], openAiKey);
  return embedding;
}

export function rankPagesByEmbedding<T extends { embedding?: number[] }>(pages: T[], embedding: number[], limit = 12) {
  return pages
    .map((page) => ({ page, score: cosineSimilarity(embedding, page.embedding) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.page);
}

export function sanitizeInternalLinkIndex(index: unknown): unknown {
  if (!index || typeof index !== "object") return index;
  const record = index as Record<string, unknown>;
  const pages = Array.isArray(record.pages)
    ? record.pages.map((page) => {
        if (!page || typeof page !== "object") return page;
        const { embedding: _embedding, text: _text, ...rest } = page as Record<string, unknown>;
        return rest;
      })
    : [];
  return { ...record, pages };
}

async function embedPages(pages: CrawledPage[], openAiKey: string, onProgress?: InternalLinkIndexOptions["onProgress"]) {
  const indexed: IndexedPage[] = [];
  let embeddedPages = 0;

  for (let index = 0; index < pages.length; index += EMBEDDING_BATCH_SIZE) {
    const batch = pages.slice(index, index + EMBEDDING_BATCH_SIZE);
    const embeddings = await embedTexts(batch.map(pageEmbeddingInput), openAiKey);
    batch.forEach((page, offset) => {
      const { text: _text, ...publicPage } = page;
      indexed.push({ ...publicPage, embedding: embeddings[offset] });
    });
    embeddedPages += batch.length;
    await onProgress?.({ step: "create_embeddings", embeddedPages });
  }

  return indexed;
}

function matchesPattern(url: string, pattern: string) {
  const value = pattern.trim().toLowerCase();
  if (!value) return false;
  return url.toLowerCase().includes(value);
}

function applyUrlFilters(urls: string[], options?: InternalLinkIndexOptions) {
  if (options?.mode !== "filtered") return urls;
  const include = options.includePatterns?.filter(Boolean) || [];
  const exclude = options.excludePatterns?.filter(Boolean) || [];

  return urls.filter((url) => {
    const included = include.length === 0 || include.some((pattern) => matchesPattern(url, pattern));
    const excluded = exclude.some((pattern) => matchesPattern(url, pattern));
    return included && !excluded;
  });
}

export async function buildInternalLinkIndex(input: string, options?: InternalLinkIndexOptions): Promise<InternalLinkIndex> {
  await options?.onProgress?.({ step: "fetch_sitemap", totalPages: 0, crawledPages: 0, embeddedPages: 0 });
  const discovery = await discoverSitemap(input);
  const urls = applyUrlFilters(Array.from(new Set(await collectSitemapUrls(discovery.sitemapUrl, discovery.rootHost)))
    .filter((url) => {
      try {
        const parsed = new URL(url);
        return isSameSiteHost(parsed.hostname, discovery.rootHost) && ["http:", "https:"].includes(parsed.protocol);
      } catch {
        return false;
      }
    }), options)
    .slice(0, MAX_PAGES);

  if (urls.length === 0) {
    throw new Error("No page URLs found in this sitemap");
  }

  let crawledPages = 0;
  await options?.onProgress?.({ step: "crawl_pages", totalPages: urls.length, crawledPages: 0, embeddedPages: 0 });
  const crawled = (await mapConcurrent(urls, PAGE_FETCH_CONCURRENCY, indexPage, async () => {
    crawledPages += 1;
    await options?.onProgress?.({ step: "crawl_pages", totalPages: urls.length, crawledPages });
  })).filter((page): page is CrawledPage => Boolean(page));

  await options?.onProgress?.({ step: "create_embeddings", totalPages: urls.length, crawledPages, embeddedPages: 0 });
  const pages = options?.openAiKey
    ? await embedPages(crawled, options.openAiKey, options.onProgress)
    : crawled.map(({ text: _text, ...page }) => page);

  await options?.onProgress?.({ step: "build_index", totalPages: urls.length, crawledPages, embeddedPages: pages.filter((page) => page.embedding?.length).length });

  return {
    sitemapUrl: discovery.sitemapUrl,
    siteHost: discovery.siteHost,
    pageCount: pages.length,
    vectorCount: pages.filter((page) => page.embedding?.length).length,
    pages,
    createdAt: new Date().toISOString(),
    sitemapSource: discovery.source,
    sitemapRedirected: discovery.redirected,
    sitemapMessages: discovery.messages,
  };
}
