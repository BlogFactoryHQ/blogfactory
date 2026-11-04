// Lightweight technical SEO audit of the user's own site: sitemap pages, on-page rules, site-level checks.
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { sites } from "../db/schema.js";
import { sitemapUrls } from "./competitor-gap.js";
import { publicFetchText } from "./public-fetch.js";
import { createTtlCache } from "./ttl-cache.js";

export type Severity = "error" | "warn" | "info";
export interface AuditIssue { rule: string; severity: Severity; detail: string }
export interface PageAudit { url: string; issues: AuditIssue[] }
export interface SiteAudit {
  checkedAt: string;
  pagesChecked: number;
  score: number;
  summary: Record<Severity, number>;
  siteIssues: AuditIssue[];
  pages: PageAudit[];
  notes: string[];
}

const MAX_PAGES = 25;
const CONCURRENCY = 4;
const SKIP_EXT = /\.(xml|pdf|jpe?g|png|gif|webp|svg|zip|mp4|css|js|json|txt)$/i;
const cache = createTtlCache<SiteAudit>(30 * 60 * 1000, 50);

function strip(value: string) {
  return value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, "\"").replace(/\s+/g, " ").trim();
}

function meta(html: string, attr: "name" | "property", value: string) {
  const forward = new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]*content=["']([^"']*)["']`, "i");
  const backward = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${value}["']`, "i");
  return (html.match(forward) || html.match(backward))?.[1]?.trim() ?? null;
}

export interface PageFacts { title: string; description: string | null; h1: number; canonical: string | null; noindex: boolean; lang: string | null; viewport: boolean; ogTitle: boolean; jsonLd: boolean; imagesMissingAlt: number; words: number }

export function pageFacts(html: string): PageFacts {
  const body = html.replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ");
  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((match) => match[0]);
  return {
    title: strip(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
    description: meta(html, "name", "description"),
    h1: (body.match(/<h1[\s>]/gi) || []).length,
    canonical: html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i)?.[1] || html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1] || null,
    noindex: /noindex/i.test(meta(html, "name", "robots") || ""),
    lang: html.match(/<html[^>]+lang=["']([^"']+)["']/i)?.[1] || null,
    viewport: Boolean(meta(html, "name", "viewport")),
    ogTitle: Boolean(meta(html, "property", "og:title")),
    jsonLd: /<script[^>]+application\/ld\+json/i.test(html),
    imagesMissingAlt: images.filter((tag) => !/\balt=/i.test(tag)).length,
    words: strip(body).split(/\s+/).filter(Boolean).length,
  };
}

export function auditPage(facts: PageFacts): AuditIssue[] {
  const issues: AuditIssue[] = [];
  const add = (rule: string, severity: Severity, detail: string) => issues.push({ rule, severity, detail });
  if (!facts.title) add("title_missing", "error", "The page has no title tag.");
  else if (facts.title.length < 15 || facts.title.length > 65) add("title_length", "warn", `Title is ${facts.title.length} characters; aim for 15 to 65.`);
  if (!facts.description) add("meta_description_missing", "warn", "No meta description.");
  else if (facts.description.length < 70 || facts.description.length > 165) add("meta_description_length", "info", `Meta description is ${facts.description.length} characters; aim for 70 to 165.`);
  if (facts.h1 === 0) add("h1_missing", "error", "No H1 heading.");
  else if (facts.h1 > 1) add("h1_multiple", "warn", `${facts.h1} H1 headings; use one.`);
  if (facts.noindex) add("noindex", "error", "The page asks search engines not to index it.");
  if (!facts.canonical) add("canonical_missing", "warn", "No canonical link.");
  if (facts.imagesMissingAlt) add("image_alt", "warn", `${facts.imagesMissingAlt} image${facts.imagesMissingAlt === 1 ? "" : "s"} without alt text.`);
  if (!facts.viewport) add("viewport_missing", "warn", "No viewport meta tag; the page may not be mobile friendly.");
  if (!facts.lang) add("lang_missing", "info", "The html element has no lang attribute.");
  if (!facts.ogTitle) add("og_missing", "info", "No Open Graph title for social sharing.");
  if (facts.words < 300) add("thin_content", "warn", `Only ${facts.words} words of text.`);
  if (!facts.jsonLd) add("structured_data_missing", "info", "No JSON-LD structured data.");
  return issues;
}

export function duplicateIssues(pages: Array<{ url: string; title: string; description: string | null }>): Array<AuditIssue & { urls: string[] }> {
  const out: Array<AuditIssue & { urls: string[] }> = [];
  for (const [field, rule] of [["title", "duplicate_title"], ["description", "duplicate_description"]] as const) {
    const groups = new Map<string, string[]>();
    for (const page of pages) {
      const value = (page[field] || "").trim().toLowerCase();
      if (value) groups.set(value, [...(groups.get(value) || []), page.url]);
    }
    for (const [value, urls] of groups) {
      if (urls.length > 1) out.push({ rule, severity: "warn", detail: `${urls.length} pages share the ${field} "${value.slice(0, 60)}".`, urls });
    }
  }
  return out;
}

export function auditScore(pages: PageAudit[], siteIssues: AuditIssue[]) {
  const weight: Record<Severity, number> = { error: 25, warn: 8, info: 2 };
  const perPage = pages.length
    ? pages.reduce((sum, page) => sum + Math.min(100, page.issues.reduce((total, issue) => total + weight[issue.severity], 0)), 0) / pages.length
    : 0;
  const site = siteIssues.reduce((total, issue) => total + (issue.severity === "error" ? 10 : issue.severity === "warn" ? 5 : 1), 0);
  return Math.max(0, Math.round(100 - perPage - site));
}

export function pickAuditUrls(origin: string, sitemap: string[], max = MAX_PAGES) {
  const host = new URL(origin).hostname.replace(/^www\./, "");
  const urls = [origin + "/"];
  for (const url of sitemap) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.replace(/^www\./, "") !== host || SKIP_EXT.test(parsed.pathname)) continue;
      parsed.hash = "";
      if (!urls.includes(parsed.href) && !urls.includes(parsed.href.replace(/\/$/, "")) ) urls.push(parsed.href);
    } catch { /* skip malformed sitemap entry */ }
    if (urls.length >= max) break;
  }
  return urls.slice(0, max);
}

export async function auditSite(userId: string, siteId: string, fresh = false): Promise<SiteAudit | null> {
  const [site] = await db.select({ id: sites.id, domain: sites.domain }).from(sites).where(and(eq(sites.id, siteId), eq(sites.userId, userId))).limit(1);
  if (!site) return null;
  const hit = fresh ? undefined : cache.get(siteId);
  if (hit) return hit;
  const origin = `https://${site.domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}`;
  const notes: string[] = [];
  const siteIssues: AuditIssue[] = [];

  const robots = await publicFetchText(`${origin}/robots.txt`, { accept: "text/plain,*/*", maxBytes: 200_000 });
  if (!robots) siteIssues.push({ rule: "robots_missing", severity: "warn", detail: "robots.txt could not be read." });
  else if (/^\s*disallow:\s*\/\s*$/im.test(robots.text) && /^\s*user-agent:\s*\*/im.test(robots.text)) siteIssues.push({ rule: "robots_blocks_all", severity: "error", detail: "robots.txt disallows the whole site for all crawlers." });
  const sitemap = await sitemapUrls(origin);
  if (!sitemap.length) siteIssues.push({ rule: "sitemap_missing", severity: "warn", detail: "No sitemap found in robots.txt, /sitemap.xml or /sitemap_index.xml." });

  const urls = pickAuditUrls(origin, sitemap);
  const facts: Array<{ url: string; facts: PageFacts }> = [];
  for (let index = 0; index < urls.length; index += CONCURRENCY) {
    const batch = await Promise.all(urls.slice(index, index + CONCURRENCY).map(async (url) => {
      const page = await publicFetchText(url, { accept: "text/html", requireHtml: true });
      return page ? { url, facts: pageFacts(page.text) } : null;
    }));
    facts.push(...batch.filter((item): item is NonNullable<typeof item> => Boolean(item)));
  }
  if (!facts.length) notes.push("No page could be read. Check that the site is public and serves HTML.");
  if (urls.length >= MAX_PAGES) notes.push(`Checked the first ${MAX_PAGES} pages from the sitemap.`);
  notes.push("Broken-link and page-speed checks are not included.");

  for (const duplicate of duplicateIssues(facts.map((item) => ({ url: item.url, title: item.facts.title, description: item.facts.description })))) {
    siteIssues.push({ rule: duplicate.rule, severity: duplicate.severity, detail: duplicate.detail });
  }
  const pages = facts.map((item) => ({ url: item.url, issues: auditPage(item.facts) })).filter((page) => page.issues.length);
  const all = [...siteIssues, ...pages.flatMap((page) => page.issues)];
  const result: SiteAudit = {
    checkedAt: new Date().toISOString(),
    pagesChecked: facts.length,
    score: facts.length ? auditScore(facts.map((item) => ({ url: item.url, issues: auditPage(item.facts) })), siteIssues) : 0,
    summary: { error: all.filter((i) => i.severity === "error").length, warn: all.filter((i) => i.severity === "warn").length, info: all.filter((i) => i.severity === "info").length },
    siteIssues,
    pages: pages.sort((a, b) => b.issues.filter((i) => i.severity === "error").length - a.issues.filter((i) => i.severity === "error").length).slice(0, 30),
    notes,
  };
  cache.set(siteId, result);
  return result;
}
