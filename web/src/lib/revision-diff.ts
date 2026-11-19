export type RevisionDiffLine = {
  type: "same" | "added" | "removed";
  text: string;
};

export function lineRevisionDiff(before: string, after: string): RevisionDiffLine[] {
  const left = before.split("\n");
  const right = after.split("\n");
  // ponytail: bound quadratic LCS work; replace with Myers only if very large articles make this fallback too coarse.
  if (left.length * right.length > 200_000) {
    if (before === after) return left.map((text) => ({ type: "same", text }));
    return [
      ...left.map((text) => ({ type: "removed" as const, text })),
      ...right.map((text) => ({ type: "added" as const, text })),
    ];
  }

  const rows = Array.from({ length: left.length + 1 }, () => new Uint32Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      rows[i][j] = left[i] === right[j]
        ? rows[i + 1][j + 1] + 1
        : Math.max(rows[i + 1][j], rows[i][j + 1]);
    }
  }

  const result: RevisionDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      result.push({ type: "same", text: left[i] });
      i += 1;
      j += 1;
    } else if (rows[i + 1][j] >= rows[i][j + 1]) {
      result.push({ type: "removed", text: left[i] });
      i += 1;
    } else {
      result.push({ type: "added", text: right[j] });
      j += 1;
    }
  }
  while (i < left.length) result.push({ type: "removed", text: left[i++] });
  while (j < right.length) result.push({ type: "added", text: right[j++] });
  return result;
}

export type NumberedRevisionDiffLine = RevisionDiffLine & {
  beforeLine: number | null;
  afterLine: number | null;
};

export type RevisionDiffHunk = {
  beforeStart: number;
  beforeCount: number;
  afterStart: number;
  afterCount: number;
  lines: NumberedRevisionDiffLine[];
};

export type RevisionDiffSummary = {
  added: number;
  removed: number;
  beforeWords: number;
  afterWords: number;
};

export function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function numberRevisionDiff(lines: RevisionDiffLine[]): NumberedRevisionDiffLine[] {
  let before = 0;
  let after = 0;
  return lines.map((line) => {
    if (line.type === "added") {
      after += 1;
      return { ...line, beforeLine: null, afterLine: after };
    }
    if (line.type === "removed") {
      before += 1;
      return { ...line, beforeLine: before, afterLine: null };
    }
    before += 1;
    after += 1;
    return { ...line, beforeLine: before, afterLine: after };
  });
}

// Collapse unchanged stretches so a long article shows only the edited regions with
// a few lines of surrounding context, the way a code review hunk reads.
export function groupRevisionDiffHunks(lines: RevisionDiffLine[], context = 3): RevisionDiffHunk[] {
  const numbered = numberRevisionDiff(lines);
  const ranges: Array<[number, number]> = [];

  numbered.forEach((line, index) => {
    if (line.type === "same") return;
    const start = Math.max(0, index - context);
    const end = Math.min(numbered.length - 1, index + context);
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
    else ranges.push([start, end]);
  });

  return ranges.map(([start, end]) => {
    const slice = numbered.slice(start, end + 1);
    const beforeNumbers = slice.map((line) => line.beforeLine).filter((value): value is number => value !== null);
    const afterNumbers = slice.map((line) => line.afterLine).filter((value): value is number => value !== null);
    return {
      beforeStart: beforeNumbers[0] ?? 0,
      beforeCount: beforeNumbers.length,
      afterStart: afterNumbers[0] ?? 0,
      afterCount: afterNumbers.length,
      lines: slice,
    };
  });
}

export function summarizeRevisionDiff(lines: RevisionDiffLine[]): RevisionDiffSummary {
  let added = 0;
  let removed = 0;
  let beforeWords = 0;
  let afterWords = 0;
  for (const line of lines) {
    const words = countWords(line.text);
    if (line.type === "added") {
      added += 1;
      afterWords += words;
    } else if (line.type === "removed") {
      removed += 1;
      beforeWords += words;
    } else {
      beforeWords += words;
      afterWords += words;
    }
  }
  return { added, removed, beforeWords, afterWords };
}
