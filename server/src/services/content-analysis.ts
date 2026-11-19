// Deterministic content analysis: no AI key, no external API.

export interface SiblingDocument { id: string; title: string; content: string }

export interface ContentAnalysis {
  words: number;
  sentences: number;
  avgSentenceWords: number;
  readability: { fleschReadingEase: number | null; level: "easy" | "standard" | "hard" };
  keyword: { term: string; count: number; density: number; inTitle: boolean; inFirst100: boolean; inHeadings: boolean; stuffing: boolean } | null;
  structure: { h2: number; h3: number; lists: number; tables: number; longParagraphs: number };
  aiPatterns: { count: number; phrases: string[] };
  duplicates: Array<{ id: string; title: string; similarity: number }>;
  flags: string[];
}

const AI_PHRASES = [
  "in today's fast-paced", "in the ever-evolving", "ever-evolving landscape", "it's important to note", "it is important to note",
  "delve into", "unlock the power", "game-changer", "game changer", "navigate the landscape", "rich tapestry", "in the realm of",
  "look no further", "take it to the next level", "in conclusion,", "harness the power",
  "günümüzün hızlı", "dijital çağda", "hiç şüphesiz", "unutmamak gerekir ki", "sonuç olarak,",
];

const SIBLING_CHAR_LIMIT = 30_000;
const ENGLISH_HINTS = new Set("the and of to in is that for with this are on as you your it be can".split(" "));

export function plainMarkdownText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^\s*\|.*\|\s*$/gm, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>`~]/g, " ")
    .replace(/^\s*[-+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function wordsOf(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}'’-]+/gu) || [];
}

export function looksEnglish(words: string[]) {
  if (words.length < 30) return false;
  const hits = words.filter((word) => ENGLISH_HINTS.has(word)).length;
  return hits / words.length > 0.18;
}

export function countSyllables(word: string) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  const groups = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups?.length || 1);
}

export function shingles(text: string, size = 4) {
  const words = wordsOf(text);
  const set = new Set<string>();
  for (let index = 0; index + size <= words.length; index += 1) set.add(words.slice(index, index + size).join(" "));
  return set;
}

export function shingleSimilarity(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const item of left) if (right.has(item)) shared += 1;
  return shared / (left.size + right.size - shared);
}

function headingsOf(markdown: string, level: 2 | 3) {
  return [...markdown.matchAll(new RegExp(`^#{${level}}\\s+(.+)$`, "gm"))].map((match) => match[1].trim());
}

export function analyzeContent(markdown: string, options: { keyword?: string; title?: string; siblings?: SiblingDocument[]; ownId?: string } = {}): ContentAnalysis {
  const text = plainMarkdownText(markdown);
  const words = wordsOf(text);
  const sentenceList = text.split(/(?<=[.!?…])\s+/).filter((sentence) => wordsOf(sentence).length >= 2);
  const sentences = Math.max(1, sentenceList.length);
  const avgSentenceWords = Math.round((words.length / sentences) * 10) / 10;

  let fleschReadingEase: number | null = null;
  if (looksEnglish(words)) {
    const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
    fleschReadingEase = Math.round((206.835 - 1.015 * avgSentenceWords - 84.6 * (syllables / words.length)) * 10) / 10;
  }
  const level = fleschReadingEase !== null
    ? (fleschReadingEase >= 60 ? "easy" : fleschReadingEase >= 40 ? "standard" : "hard")
    : (avgSentenceWords <= 16 ? "easy" : avgSentenceWords <= 24 ? "standard" : "hard");

  const h2 = headingsOf(markdown, 2);
  const h3 = headingsOf(markdown, 3);
  const h1 = markdown.match(/^#\s+(.+)$/m)?.[1] || options.title || "";
  const term = (options.keyword || "").trim().toLowerCase();
  let keyword: ContentAnalysis["keyword"] = null;
  if (term) {
    const lower = text.toLowerCase();
    const count = lower.split(term).length - 1;
    const density = words.length ? Math.round(((count * wordsOf(term).length) / words.length) * 10000) / 100 : 0;
    keyword = {
      term,
      count,
      density,
      inTitle: h1.toLowerCase().includes(term),
      inFirst100: words.slice(0, 100).join(" ").includes(term),
      inHeadings: [...h2, ...h3].some((heading) => heading.toLowerCase().includes(term)),
      stuffing: density > 3,
    };
  }

  const lowerText = text.toLowerCase();
  const phrases = AI_PHRASES.filter((phrase) => lowerText.includes(phrase));
  const paragraphs = markdown.replace(/```[\s\S]*?```/g, "").split(/\n{2,}/).map((block) => block.trim()).filter((block) => block && !/^(#|[-*+]\s|\d+\.\s|\||>)/.test(block));
  const structure = {
    h2: h2.length,
    h3: h3.length,
    lists: (markdown.match(/^\s*(?:[-*+]|\d+\.)\s+/gm) || []).length,
    tables: (markdown.match(/^\s*\|[\s:-]+\|/gm) || []).length,
    longParagraphs: paragraphs.filter((block) => wordsOf(block).length > 120).length,
  };

  const duplicates: ContentAnalysis["duplicates"] = [];
  if (options.siblings?.length) {
    const own = shingles(text);
    for (const sibling of options.siblings) {
      if (sibling.id === options.ownId) continue;
      const similarity = shingleSimilarity(own, shingles(plainMarkdownText(sibling.content.slice(0, SIBLING_CHAR_LIMIT))));
      if (similarity >= 0.15) duplicates.push({ id: sibling.id, title: sibling.title, similarity: Math.round(similarity * 100) / 100 });
    }
    duplicates.sort((a, b) => b.similarity - a.similarity);
    duplicates.splice(5);
  }

  const flags: string[] = [];
  if (level === "hard") flags.push("Hard to read: shorten sentences and split ideas.");
  if (keyword?.stuffing) flags.push(`Keyword density ${keyword.density}% looks stuffed; vary the wording.`);
  if (keyword && !keyword.inTitle) flags.push("Primary keyword is missing from the H1.");
  if (keyword && !keyword.inFirst100) flags.push("Primary keyword is missing from the first 100 words.");
  if (structure.h2 < 3 && words.length > 600) flags.push("Few H2 sections for the length; add structure.");
  if (structure.longParagraphs) flags.push(`${structure.longParagraphs} paragraph(s) over 120 words.`);
  if (phrases.length >= 2) flags.push("Several stock AI phrases found; rewrite them in the brand voice.");
  if (duplicates[0]?.similarity >= 0.4) flags.push(`Near-duplicate of "${duplicates[0].title}" (${Math.round(duplicates[0].similarity * 100)}% overlap).`);

  return {
    words: words.length,
    sentences,
    avgSentenceWords,
    readability: { fleschReadingEase, level },
    keyword,
    structure,
    aiPatterns: { count: phrases.length, phrases },
    duplicates,
    flags,
  };
}
