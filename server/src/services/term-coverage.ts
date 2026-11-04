// Surfer-style term coverage without a paid tool: terms most top-ranking pages share, and which ones a draft is missing.
import { stem } from "./product-seo.js";

export interface SerpTerm { term: string; docs: number }
export interface TermCoverage { coverage: number; covered: string[]; missing: SerpTerm[]; total: number }

const STOP = new Set((
  "the and for are but not you your with this that from have has had was were will would can could should their there what when which who how why into than then them they our out about also more most some such only over under just like very been being does did its it's i'm you're don't can't a an of to in is it on or as at by be we he she his her him my me us if so no yes all any each both few many much other own same too via per ve bir bu için ile daha gibi olan çok da de mi mu ne"
).split(" "));

const MIN_DOCS_FOR_TERMS = 3;
const TERM_LIMIT = 30;

function words(text: string) {
  return text.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}'-]*/gu) || [];
}

function isTermWord(word: string) {
  return word.length > 3 && !STOP.has(word) && !/^\d+$/.test(word);
}

// Unigrams and adjacent-word bigrams; a stopword breaks a bigram so "rate of growth" never yields "rate growth".
function termsOf(text: string) {
  const list = words(text);
  const found = new Map<string, { surface: string; count: number }>();
  const add = (key: string, surface: string) => {
    const hit = found.get(key);
    if (hit) hit.count += 1; else found.set(key, { surface, count: 1 });
  };
  for (let index = 0; index < list.length; index += 1) {
    if (!isTermWord(list[index])) continue;
    add(stem(list[index]), list[index]);
    if (index + 1 < list.length && isTermWord(list[index + 1])) {
      add(`${stem(list[index])} ${stem(list[index + 1])}`, `${list[index]} ${list[index + 1]}`);
    }
  }
  return found;
}

export function extractTerms(texts: string[], options: { keyword?: string; max?: number } = {}): SerpTerm[] {
  const documents = texts.filter((text) => text && text.length > 200);
  if (documents.length < MIN_DOCS_FOR_TERMS) return [];
  const keywordStems = new Set(words(options.keyword || "").filter(isTermWord).map(stem));
  const minDocs = Math.max(2, Math.ceil(documents.length * 0.5));
  const stats = new Map<string, { docs: number; total: number; surfaces: Map<string, number> }>();
  for (const text of documents) {
    for (const [key, { surface, count }] of termsOf(text)) {
      const stat = stats.get(key) || { docs: 0, total: 0, surfaces: new Map() };
      stat.docs += 1;
      stat.total += count;
      stat.surfaces.set(surface, (stat.surfaces.get(surface) || 0) + count);
      stats.set(key, stat);
    }
  }
  return [...stats.entries()]
    .filter(([key, stat]) => stat.docs >= minDocs && !key.split(" ").every((part) => keywordStems.has(part)))
    .map(([key, stat]) => ({
      term: [...stat.surfaces.entries()].sort((a, b) => b[1] - a[1])[0][0],
      docs: stat.docs,
      score: stat.docs * 10 + Math.min(stat.total, 50) / 5 + (key.includes(" ") ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, options.max ?? TERM_LIMIT)
    .map(({ term, docs }) => ({ term, docs }));
}

export function termCoverage(postText: string, terms: SerpTerm[]): TermCoverage {
  const list = words(postText);
  const unigrams = new Set<string>();
  const bigrams = new Set<string>();
  for (let index = 0; index < list.length; index += 1) {
    if (!isTermWord(list[index])) continue;
    unigrams.add(stem(list[index]));
    if (index + 1 < list.length && isTermWord(list[index + 1])) bigrams.add(`${stem(list[index])} ${stem(list[index + 1])}`);
  }
  const covered: string[] = [];
  const missing: SerpTerm[] = [];
  for (const item of terms) {
    const parts = words(item.term).map(stem);
    const present = parts.length === 2 ? bigrams.has(parts.join(" ")) : unigrams.has(parts[0]);
    if (present) covered.push(item.term); else missing.push(item);
  }
  return { coverage: terms.length ? Math.round((covered.length / terms.length) * 100) : 0, covered, missing, total: terms.length };
}
