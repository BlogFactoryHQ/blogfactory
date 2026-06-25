import { describe, expect, it } from "vitest";
import { parseDraftProgress } from "./useJobTracker";

describe("parseDraftProgress", () => {
  it("reads current draft from backend step names", () => {
    expect(parseDraftProgress("generating_draft_2_of_5", { totalDrafts: 5 }, ["a"])).toMatchObject({
      current: 2,
      total: 5,
      completed: 1,
    });

    expect(parseDraftProgress("repairing_length_for_draft_3", { totalDrafts: 5 }, ["a", "b"])).toMatchObject({
      current: 3,
      total: 5,
      completed: 2,
    });

    expect(parseDraftProgress("resolving_images_for_draft_4", { totalDrafts: 5 }, ["a", "b", "c", "d"])).toMatchObject({
      current: 4,
      total: 5,
      completed: 4,
    });
  });
});
