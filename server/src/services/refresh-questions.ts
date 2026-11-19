// Refresh helper: which questions people ask about the target query does the existing page not answer yet?
import { headingsFromHtml, questionTree } from "./keyword-research.js";
import { fetchPage, stem, strip, tokens, topicSimilarity } from "./product-seo.js";

export interface RefreshSuggestion { impact: "high" | "medium" | "low"; title: string; detail: string }

export function missingQuestions(pageText: string, headings: string[], questions: string[], max = 5) {
  const pageTokens = new Set(tokens(pageText).map(stem));
  const missing: string[] = [];
  for (const question of questions) {
    const needed = [...new Set(tokens(question).map(stem))];
    if (needed.length < 2) continue;
    const covered = needed.filter((token) => pageTokens.has(token)).length / needed.length;
    const inHeading = headings.some((heading) => topicSimilarity(heading, question) >= 0.75);
    if (!inHeading && covered < 0.8) missing.push(question);
    if (missing.length >= max) break;
  }
  return missing;
}

export function questionRefreshSuggestions(missing: string[]): RefreshSuggestion[] {
  if (!missing.length) return [];
  return [{
    impact: "medium",
    title: `Answer ${missing.length} question${missing.length === 1 ? "" : "s"} searchers ask`,
    detail: `The page does not clearly answer: ${missing.map((question) => `"${question}"`).join("; ")}. Add them as FAQ entries or short sections.`,
  }];
}

export async function questionSuggestions(input: { pageUrl: string; targetQuery: string; language?: string | null }): Promise<RefreshSuggestion[]> {
  const language = (input.language || "en").slice(0, 2).toLowerCase();
  const [tree, page] = await Promise.all([questionTree(input.targetQuery, language, 20), fetchPage(input.pageUrl)]);
  if (!page || !tree.questions.length) return [];
  const body = page.html.replace(/<(script|style|nav|footer|header|aside)[\s\S]*?<\/\1>/gi, " ");
  return questionRefreshSuggestions(missingQuestions(strip(body), headingsFromHtml(page.html), tree.questions.map((item) => item.question)));
}
