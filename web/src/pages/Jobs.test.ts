import { describe, expect, it } from "vitest";
import { aggregateJobRows, jobGroupKey } from "./Jobs";

const baseJob = {
  id: "job-1",
  source_type: "url",
  source_value: "https://example.com/source",
  persona_id: "persona",
  model_id: "model",
  status: "completed",
  current_step: "done",
  error_message: null,
  generation_error: null,
  token_cost: 1000,
  total_cost: 0.01,
  result_post_ids: ["post-1"],
  created_at: "2026-06-26T00:00:00.000Z",
  completed_at: "2026-06-26T00:01:00.000Z",
  generation_plan: { batchId: "batch-1", totalDrafts: 1, variationCount: 3, variationIndex: 1 },
  personas: { name: "Persona" },
};

describe("job batch grouping", () => {
  it("groups sibling split jobs by batch id", () => {
    expect(jobGroupKey(baseJob as any)).toBe("batch-batch-1");
  });

  it("aggregates split draft jobs into one row", () => {
    const rows = aggregateJobRows([
      baseJob,
      {
        ...baseJob,
        id: "job-2",
        status: "running",
        current_step: "generating_draft_1_of_1",
        result_post_ids: [],
        completed_at: null,
        generation_plan: { ...baseJob.generation_plan, variationIndex: 2 },
      },
      {
        ...baseJob,
        id: "job-3",
        status: "failed",
        error_message: "Model timed out",
        result_post_ids: [],
        generation_plan: { ...baseJob.generation_plan, variationIndex: 3 },
      },
    ] as any);

    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("running");
    expect(rows[0].current_step).toBe("generating_draft_2_of_3");
    expect(rows[0].result_post_ids).toEqual(["post-1"]);
    expect(rows[0].generation_plan.failedDrafts).toEqual([{ index: 2, error: "Model timed out" }]);
  });
});
