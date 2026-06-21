interface IndexedPage {
  url: string;
  title: string;
  description?: string;
  path: string;
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
}

const MAX_SITEMAPS = 12;
const MAX_PAGES = 150;
const PAGE_FETCH_CONCURRENCY = 8;

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

async function indexPage(url: string): Promise<IndexedPage | null> {
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

    return {
      url: parsed.toString(),
      title,
      description: description || undefined,
      path: parsed.pathname,
    };
  } catch {
    return {
      url: parsed.toString(),
      title: titleFromUrl(parsed),
      path: parsed.pathname,
    };
  }
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results: R[] = [];
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
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

  const pages = (await mapConcurrent(urls, PAGE_FETCH_CONCURRENCY, indexPage))
    .filter((page): page is IndexedPage => Boolean(page));

  return {
    sitemapUrl: discovery.sitemapUrl,
    siteHost: discovery.siteHost,
    pageCount: pages.length,
    vectorCount: pages.length,
    pages,
    createdAt: new Date().toISOString(),
    sitemapSource: discovery.source,
    sitemapRedirected: discovery.redirected,
    sitemapMessages: discovery.messages,
  };
}
