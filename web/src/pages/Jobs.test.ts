import { describe, expect, it } from "vitest";
import { aggregateJobRows, jobGroupKey, parseStepProgress } from "./Jobs";

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

describe("job progress steps", () => {
  it("shows source fetching before draft progress", () => {
    const progress = parseStepProgress("fetching_content", [], { totalDrafts: 1, imagesEnabled: true });

    expect(progress.label).toBe("Fetching source content");
    expect(progress.percent).toBe(10);
    expect(progress.steps[0]).toMatchObject({ label: "Fetch source content", active: true });
    expect(progress.steps.some((step) => step.label.includes("Draft 0"))).toBe(false);
  });

  it("shows image resolution as the active draft step", () => {
    const progress = parseStepProgress("resolving_images_for_draft_1", [], { totalDrafts: 1, imagesEnabled: true });

    expect(progress.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Queue AI images or find stock/source fallback", active: true }),
      expect.objectContaining({ label: "Draft 1 (images)", active: true }),
    ]));
  });

  it("shows image resolution as the active step after a draft exists", () => {
    const progress = parseStepProgress("resolving_images_for_draft_1", ["post-1"], { totalDrafts: 1 });

    expect(progress.label).toBe("Finding images for draft 1 of 1");
    expect(progress.steps[0]).toMatchObject({ label: "Draft 1 (finding images)", active: true });
  });
});
