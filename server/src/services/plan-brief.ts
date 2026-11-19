// A research brief stored on a plan item so the create flow can prefill outline, length and FAQs.
export interface PlanBrief {
  keyword: string;
  targetWords: number | null;
  outline: Array<{ level: 2 | 3; text: string }>;
  questions: string[];
  source: "serp" | "questions";
}

interface ResearchLike {
  keyword: string;
  questions: Array<{ question: string }>;
  serp: { brief: { targetWords: number; sharedHeadings: Array<{ heading: string }> } } | null;
}

const MAX_OUTLINE = 20;
const MAX_QUESTIONS = 8;

function sentenceCase(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

function asQuestion(value: string) {
  const text = sentenceCase(value).replace(/\?+$/, "");
  return text ? `${text}?` : text;
}

export function toPlanBrief(research: ResearchLike): PlanBrief {
  const questions = research.questions.slice(0, 5).map((item) => asQuestion(item.question)).filter(Boolean);
  const shared = research.serp?.brief.sharedHeadings.slice(0, 6).map((item) => sentenceCase(item.heading)) || [];
  const outline: PlanBrief["outline"] = shared.map((text) => ({ level: 2 as const, text }));
  if (questions.length) {
    outline.push({ level: 2, text: "FAQ" }, ...questions.map((text) => ({ level: 3 as const, text })));
  }
  return {
    keyword: research.keyword,
    targetWords: research.serp?.brief.targetWords ?? null,
    outline,
    questions,
    source: research.serp ? "serp" : "questions",
  };
}

// Client-supplied briefs are untrusted: rebuild the object from validated fields only.
export function sanitizePlanBrief(raw: unknown): PlanBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const keyword = typeof data.keyword === "string" ? data.keyword.trim().slice(0, 90) : "";
  if (!keyword) return null;
  const words = Number(data.targetWords);
  const outline = (Array.isArray(data.outline) ? data.outline : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const text = typeof record.text === "string" ? record.text.replace(/\s+/g, " ").trim().slice(0, 120) : "";
    return text ? [{ level: Number(record.level) === 3 ? 3 as const : 2 as const, text }] : [];
  }).slice(0, MAX_OUTLINE);
  const questions = (Array.isArray(data.questions) ? data.questions : [])
    .map((item) => String(item ?? "").replace(/\s+/g, " ").trim().slice(0, 120)).filter(Boolean).slice(0, MAX_QUESTIONS);
  return {
    keyword,
    targetWords: Number.isFinite(words) && words >= 300 && words <= 5000 ? Math.round(words) : null,
    outline,
    questions,
    source: data.source === "serp" ? "serp" : "questions",
  };
}

// Same line format the article generator and outline textarea use.
export function outlineToText(outline: PlanBrief["outline"]) {
  return outline.map((heading) => `H${heading.level}: ${heading.text}`).join("\n");
}
