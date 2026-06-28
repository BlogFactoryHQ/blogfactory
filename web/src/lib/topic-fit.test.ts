import { describe, expect, it } from "vitest";
import { analyzeCampaignPattern, analyzeProgrammaticFit, analyzeTopicFit } from "./topic-fit";

describe("topic fit helpers", () => {
  it("marks factual search topics as a good fit", () => {
    expect(analyzeTopicFit("how to clean a standing desk").tone).toBe("good");
    expect(analyzeTopicFit("Notion vs Obsidian").title).toBe("Good AI fit");
  });

  it("asks for context on recent or subjective topics", () => {
    expect(analyzeTopicFit("latest AI news today").tone).toBe("context");
    expect(analyzeTopicFit("my hands-on review of a new laptop").title).toBe("Add source/context");
  });

  it("finds repeated campaign patterns", () => {
    const result = analyzeCampaignPattern([
      "can dogs eat carrots",
      "can dogs eat apples",
      "can dogs eat bananas",
      "can dogs eat rice",
      "can dogs eat bread",
    ].join("\n"));

    expect(result.title).toBe("Repeatable pattern found");
  });

  it("recognizes scalable programmatic templates", () => {
    expect(analyzeProgrammaticFit("How much {{nutrient}} is in {{food}}", 2).tone).toBe("scale");
    expect(analyzeProgrammaticFit("How to cook {{food}}", 1).title).toBe("Good one-variable pattern");
  });
});
