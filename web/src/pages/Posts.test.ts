import { describe, expect, it } from "vitest";
import { draftGroupKey, draftTotalForPlan } from "./Posts";

const basePost = {
  job_id: "job-1",
  source_type: "url",
  source_ref_id: "https://example.com/source",
  persona_id: "persona",
  model_id: "model",
  created_at: "2026-06-25T20:00:00.000Z",
};

describe("draftGroupKey", () => {
  it("groups sibling split jobs by batch id", () => {
    expect(draftGroupKey({ ...basePost, generation_plan: { totalDrafts: 1, variationCount: 5, batchId: "batch-1" } }))
      .toBe("batch-batch-1");
  });

  it("uses variation count when split child jobs each report one draft", () => {
    expect(draftTotalForPlan({ totalDrafts: 1, variationCount: 3 }, 3)).toBe(3);
  });

  it("groups old split jobs by source/model/day fallback", () => {
    const first = draftGroupKey({ ...basePost, job_id: "job-1", generation_plan: { totalDrafts: 1, variationCount: 5 } });
    const second = draftGroupKey({ ...basePost, job_id: "job-2", generation_plan: { totalDrafts: 1, variationCount: 5 } });
    expect(first).toBe(second);
  });

  it("does not group feed posts as draft variations", () => {
    expect(draftGroupKey({
      ...basePost,
      source_type: "rss_feed",
      generation_plan: { totalDrafts: 3 },
    })).toBe("");
  });
});
