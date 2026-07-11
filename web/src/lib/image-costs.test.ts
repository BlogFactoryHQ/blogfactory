import { describe, expect, it } from "vitest";
import { summarizeImageCosts } from "./image-costs";

describe("summarizeImageCosts", () => {
  it("preserves provider and model totals from SQL groups", () => {
    const result = summarizeImageCosts([
      { provider: "openrouter-image", model_id: "model-a", requests: 2, total_cost: 0.04 },
      { provider: "openrouter-image", model_id: "model-b", requests: 1, total_cost: 0.03 },
      { provider: "openai-image", model_id: "model-c", requests: 1, total_cost: 0.02 },
    ]);
    expect(result.map(({ provider, imageCount, totalCost }) => ({ provider, imageCount, totalCost }))).toEqual([
      { provider: "openrouter-image", imageCount: 3, totalCost: 0.07 },
      { provider: "openai-image", imageCount: 1, totalCost: 0.02 },
    ]);
    expect(result[0].models.get("model-a")).toEqual({ count: 2, cost: 0.04 });
  });
});
