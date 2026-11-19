// schema.org JSON-LD and llms.txt builders. Pure functions, no network.
import { plainMarkdownText } from "./content-analysis.js";

export interface FaqEntry { question: string; answer: string }

export function extractFaq(markdown: string, max = 10): FaqEntry[] {
  const section = markdown.match(/^##\s+(?:FAQs?|Frequently Asked Questions|Sık Sorulan Sorular|SSS)[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im)?.[1] ?? markdown;
  const entries: FaqEntry[] = [];
  const parts = section.split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const [heading, ...rest] = part.split("\n");
    const question = heading.replace(/[*_`]/g, "").trim();
    const answer = plainMarkdownText(rest.join("\n")).slice(0, 700);
    if (/\?\s*$/.test(question) && answer.length >= 20) entries.push({ question, answer });
    if (entries.length >= max) break;
  }
  return entries;
}

export function buildFaqJsonLd(entries: FaqEntry[]) {
  if (!entries.length) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

export function buildArticleJsonLd(input: {
  title: string;
  description?: string | null;
  url?: string | null;
  image?: string | null;
  datePublished?: string | null;
  dateModified?: string | null;
  publisherName?: string | null;
  language?: string | null;
}) {
  const clean = <T extends Record<string, unknown>>(value: T) => Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "")) as T;
  return clean({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title.slice(0, 110),
    description: input.description?.slice(0, 300),
    image: input.image || undefined,
    inLanguage: input.language || undefined,
    datePublished: input.datePublished || undefined,
    dateModified: input.dateModified || undefined,
    mainEntityOfPage: input.url ? { "@type": "WebPage", "@id": input.url } : undefined,
    publisher: input.publisherName ? { "@type": "Organization", name: input.publisherName } : undefined,
  });
}

export function buildLlmsTxt(input: {
  name: string;
  summary?: string | null;
  pages: Array<{ title: string; url: string; description?: string | null }>;
  posts: Array<{ title: string; url: string; description?: string | null }>;
}) {
  const line = (item: { title: string; url: string; description?: string | null }) =>
    `- [${item.title.replace(/[\[\]]/g, "")}](${item.url})${item.description ? `: ${item.description.replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
  const seen = new Set<string>();
  const unique = <T extends { url: string }>(items: T[]) => items.filter((item) => item.url && !seen.has(item.url) && seen.add(item.url));
  const pages = unique(input.pages).slice(0, 25);
  const posts = unique(input.posts).slice(0, 50);
  return [
    `# ${input.name}`,
    input.summary ? `\n> ${input.summary.replace(/\s+/g, " ").slice(0, 300)}` : "",
    pages.length ? `\n## Key pages\n\n${pages.map(line).join("\n")}` : "",
    posts.length ? `\n## Articles\n\n${posts.map(line).join("\n")}` : "",
    "",
  ].filter((part) => part !== "").join("\n");
}

// FAQPage markup for CMS drafts. Needs at least two real Q&As; `<` is escaped so the JSON cannot close the script tag.
export function faqJsonLdHead(markdown: unknown) {
  if (typeof markdown !== "string") return null;
  const entries = extractFaq(markdown);
  if (entries.length < 2) return null;
  const json = JSON.stringify(buildFaqJsonLd(entries)).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}
