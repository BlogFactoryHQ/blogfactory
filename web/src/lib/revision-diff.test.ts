import { describe, expect, it } from "vitest";
import { lineRevisionDiff } from "./revision-diff";

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
