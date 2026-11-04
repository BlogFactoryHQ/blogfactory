// Deterministic repurposing of a saved draft into social and newsletter copy. No AI call, no cost, no invented claims.
import { plainMarkdownText } from "./content-analysis.js";

const SKIP_HEADING = /faq|frequently|sık sorulan|sss|conclusion|final (take|recommendation)|next steps|sonuç/i;

export interface RepurposeInput { title: string; markdown: string; url?: string | null }
export interface RepurposeOutput {
  xThread: string[];
  linkedin: string;
  newsletter: { subject: string; preheader: string; body: string };
}

function cut(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  return `${slice.slice(0, Math.max(slice.lastIndexOf(" "), Math.floor(max * 0.6))).trim()}…`;
}

export function firstSentence(text: string, max = 200) {
  const plain = plainMarkdownText(text);
  const match = plain.match(/^(.+?[.!?])(\s|$)/);
  return cut(match ? match[1] : plain, max);
}

export function sectionsOf(markdown: string) {
  return markdown.split(/^##\s+/m).slice(1).flatMap((block) => {
    const [heading, ...rest] = block.split("\n");
    const title = heading.replace(/[*_`]/g, "").trim();
    const body = rest.filter((line) => !/^#{3,}\s/.test(line)).join("\n");
    const sentence = firstSentence(body);
    return title && sentence && !SKIP_HEADING.test(title) ? [{ heading: title, sentence }] : [];
  });
}

export function leadParagraphs(markdown: string, maxWords = 90) {
  const paragraphs = markdown.replace(/^#.*$/gm, "").split(/\n{2,}/).map((block) => plainMarkdownText(block)).filter((block) => block.split(" ").length >= 8);
  const out: string[] = [];
  let used = 0;
  for (const paragraph of paragraphs) {
    if (used >= maxWords) break;
    const take = paragraph.split(" ").slice(0, maxWords - used).join(" ");
    out.push(take.length < paragraph.length ? `${take}…` : take);
    used += take.split(" ").length;
  }
  return out;
}

export function buildRepurposed(input: RepurposeInput): RepurposeOutput {
  const sections = sectionsOf(input.markdown);
  const lead = leadParagraphs(input.markdown);
  const link = input.url || null;

  const tweets = [cut(input.title, 270)];
  sections.slice(0, 5).forEach((section, index) => tweets.push(cut(`${index + 2}/ ${section.heading}: ${section.sentence}`, 280)));
  tweets.push(cut(`${tweets.length + 1}/ ${link ? `Read the full guide: ${link}` : "Read the full guide on our blog."}`, 280));

  const bullets = sections.slice(0, 4).map((section) => `• ${section.heading}: ${cut(section.sentence, 140)}`);
  const linkedin = cut([
    input.title,
    lead[0] ? firstSentence(lead[0], 220) : "",
    bullets.length ? `What you will learn:\n${bullets.join("\n")}` : "",
    link ? `Full guide: ${link}` : "",
  ].filter(Boolean).join("\n\n"), 1300);

  return {
    xThread: tweets,
    linkedin,
    newsletter: {
      subject: cut(input.title, 60),
      preheader: lead[0] ? firstSentence(lead[0], 100) : cut(input.title, 100),
      body: [...lead, `Read the full article: ${link || "{{article_url}}"}`].join("\n\n"),
    },
  };
}
