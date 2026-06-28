export type TopicFitTone = "good" | "context" | "scale" | "neutral";

export interface TopicFitResult {
  tone: TopicFitTone;
  title: string;
  detail: string;
}

const factualPatterns = [
  /\bhow to\b/i,
  /\bwhat is\b/i,
  /\bcan (you|i|we|dogs|cats|kids|people)\b/i,
  /\bwhy (is|does|do|are)\b/i,
  /\b(best|top)\b/i,
  /\bvs\.?\b|\bversus\b/i,
  /\b(alternatives|comparison|guide|examples|checklist|definition)\b/i,
];

const contextPatterns = [
  /\b(news|breaking|today|yesterday|this week|latest|20\d{2})\b/i,
  /\b(review|opinion|hot take|my experience|hands-on|tested)\b/i,
  /\bnear me|local|neighborhood\b/i,
];

function cleanLines(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function analyzeTopicFit(value: string): TopicFitResult {
  const topic = value.trim();
  if (!topic) {
    return {
      tone: "neutral",
      title: "Pick a factual search target",
      detail: "How-to, what-is, question, comparison, and list topics usually need the least editing.",
    };
  }

  if (contextPatterns.some((pattern) => pattern.test(topic))) {
    return {
      tone: "context",
      title: "Add source/context",
      detail: "Recent, local, review, or opinion-heavy topics work better with source URLs or notes.",
    };
  }

  if (factualPatterns.some((pattern) => pattern.test(topic)) || topic.endsWith("?")) {
    return {
      tone: "good",
      title: "Good AI fit",
      detail: "This looks factual and search-led, which is where AI drafts tend to perform best.",
    };
  }

  return {
    tone: "neutral",
    title: "Check the angle",
    detail: "If there are 5+ solid sources online, this is probably fine. Add context for niche or subjective topics.",
  };
}

export function analyzeCampaignPattern(value: string): TopicFitResult {
  const lines = cleanLines(value);
  if (!lines.length) {
    return {
      tone: "neutral",
      title: "Add campaign items",
      detail: "Flat keyword lists are fine; repeated patterns belong in Programmatic.",
    };
  }

  if (lines.length >= 5) {
    const tokenRows = lines.map((line) => line.toLowerCase().replace(/[^\w\s-]/g, "").split(/\s+/).filter(Boolean));
    const sameLength = tokenRows.every((row) => row.length === tokenRows[0].length);
    if (sameLength && tokenRows[0].length > 2) {
      const changingColumns = tokenRows[0].filter((_, index) => new Set(tokenRows.map((row) => row[index])).size > 1).length;
      if (changingColumns > 0 && changingColumns <= 2) {
        return {
          tone: "scale",
          title: "Repeatable pattern found",
          detail: "This can scale cleaner as a Programmatic template with variables.",
        };
      }
    }
  }

  return {
    tone: "scale",
    title: "Low volume is okay at scale",
    detail: `${lines.length} item${lines.length === 1 ? "" : "s"} ready. Small keywords can compound across a focused campaign.`,
  };
}

export function analyzeProgrammaticFit(titleTemplate: string, variableCount: number): TopicFitResult {
  if (variableCount >= 2) {
    return {
      tone: "scale",
      title: "Strong scalable pattern",
      detail: "Two-variable templates are a good fit for all-combinations campaigns.",
    };
  }

  if (variableCount === 1) {
    return {
      tone: "good",
      title: "Good one-variable pattern",
      detail: "Use one value per row, or add a second variable if the topic naturally expands.",
    };
  }

  return analyzeTopicFit(titleTemplate);
}
