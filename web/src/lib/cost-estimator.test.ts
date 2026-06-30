import { describe, expect, it } from "vitest";
import { estimateGenerationCost, shouldWarnForCost } from "./cost-estimator";

const textModel = { id: "test/text", rawPricing: { prompt: 1, completion: 2, request: 0 } };
const imageModel = { id: "x-ai/grok-imagine-image-quality", rawPricing: { prompt: 0, completion: 0, image: 0, request: 0 } };
const paidImageModel = { id: "x-ai/grok-imagine-image-quality", rawPricing: { prompt: 0, completion: 0, image: 0.04, request: 0 } };
const resolutionPricedImageModel = { id: "test/image", rawPricing: { prompt: 0, completion: 0, image: 0.05, request: 0, imageByResolution: { "512": 0.02, "1K": 0.05 } } };

const imageConfig = {
  cover: { enabled: true },
  inline: { enabled: true, count: 2 },
};

describe("cost estimator", () => {
  it("estimates one post with no images", () => {
    const estimate = estimateGenerationCost({
      postCount: 1,
      textModel,
      imageModel,
      imageConfig: { ...imageConfig, cover: { ...imageConfig.cover, enabled: false }, inline: { ...imageConfig.inline, enabled: false } },
    });
    expect(estimate.postCount).toBe(1);
    expect(estimate.coverImageCost).toBe(0);
    expect(estimate.totalExpected).toBeGreaterThan(0);
    expect(estimate.textCost).toBeCloseTo(estimate.textCostPerPost);
    expect(estimate.textCostPerPost).toBeCloseTo(estimate.promptCostPerPost + estimate.completionCostPerPost + estimate.requestCostPerPost);
  });

  it("estimates programmatic batches", () => {
    const estimate = estimateGenerationCost({ postCount: 1500, articleWordCount: 1500, textModel, imageModel: paidImageModel, imageConfig });
    expect(estimate.postCount).toBe(1500);
    expect(estimate.coverImageCost).toBeCloseTo(60);
    expect(shouldWarnForCost({ estimate })).toBe(true);
  });

  it("keeps zero-priced inline model at zero expected image spend", () => {
    const estimate = estimateGenerationCost({ postCount: 10, textModel, imageModel, inlineImageModel: imageModel, imageConfig, inlineImageSource: "ai" });
    expect(estimate.inlineImageCost).toBe(0);
    expect(estimate.assumptions.join(" ")).toContain("OpenRouter image model");
  });

  it("counts paid inline image spend", () => {
    const estimate = estimateGenerationCost({ postCount: 2, textModel, imageModel, inlineImageModel: paidImageModel, imageConfig, inlineImageSource: "ai" });
    expect(estimate.inlineImageCost).toBeCloseTo(0.16);
  });

  it("uses selected image resolution pricing when available", () => {
    const estimate = estimateGenerationCost({
      postCount: 2,
      textModel,
      imageModel: resolutionPricedImageModel,
      inlineImageModel: resolutionPricedImageModel,
      imageConfig: { cover: { enabled: true, resolution: "512" }, inline: { enabled: true, count: 1, resolution: "1K" } },
      inlineImageSource: "ai",
    });
    expect(estimate.coverImageCost).toBeCloseTo(0.04);
    expect(estimate.inlineImageCost).toBeCloseTo(0.1);
  });

  it("keeps stock inline image spend at zero", () => {
    const estimate = estimateGenerationCost({ postCount: 2, textModel, imageModel, inlineImageModel: paidImageModel, imageConfig, inlineImageSource: "stock" });
    expect(estimate.inlineImageCost).toBe(0);
    expect(estimate.assumptions.join(" ")).toContain("$0 image generation cost");
  });

  it("warns near budget", () => {
    const estimate = estimateGenerationCost({ postCount: 1, textModel, imageModel: paidImageModel, imageConfig });
    expect(shouldWarnForCost({ estimate, monthlyBudget: 1, currentMonthSpend: 0.79 })).toBe(true);
  });
});
