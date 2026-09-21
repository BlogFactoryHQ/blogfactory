import { describe, expect, it } from "vitest";
import { groupRevisionDiffHunks, lineRevisionDiff, summarizeRevisionDiff } from "./revision-diff";

describe("lineRevisionDiff", () => {
  it("keeps context and marks additions and removals", () => {
    expect(lineRevisionDiff("one\ntwo\nthree", "one\nnew\nthree")).toEqual([
      { type: "same", text: "one" },
      { type: "removed", text: "two" },
      { type: "added", text: "new" },
      { type: "same", text: "three" },
    ]);
  });
});

describe("groupRevisionDiffHunks", () => {
  it("returns no hunks when nothing changed", () => {
    expect(groupRevisionDiffHunks(lineRevisionDiff("a\nb", "a\nb"))).toEqual([]);
  });

  it("numbers both sides and keeps surrounding context", () => {
    const hunks = groupRevisionDiffHunks(lineRevisionDiff("one\ntwo\nthree", "one\nnew\nthree"), 1);
    expect(hunks).toHaveLength(1);
    expect(hunks[0]).toMatchObject({ beforeStart: 1, beforeCount: 3, afterStart: 1, afterCount: 3 });
    expect(hunks[0].lines.map((line) => [line.type, line.beforeLine, line.afterLine])).toEqual([
      ["same", 1, 1],
      ["removed", 2, null],
      ["added", null, 2],
      ["same", 3, 3],
    ]);
  });

  it("collapses unchanged stretches into separate hunks", () => {
    const before = ["a", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "z"].join("\n");
    const after = ["A", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "Z"].join("\n");
    const hunks = groupRevisionDiffHunks(lineRevisionDiff(before, after), 1);
    expect(hunks).toHaveLength(2);
    expect(hunks[0].lines.some((line) => line.text === "p4")).toBe(false);
  });
});

describe("summarizeRevisionDiff", () => {
  it("counts changed lines and words on each side", () => {
    const summary = summarizeRevisionDiff(lineRevisionDiff("one two\nthree", "one two\nthree four five"));
    expect(summary).toEqual({ added: 1, removed: 1, beforeWords: 3, afterWords: 5 });
  });
});
