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
