import { describe, expect, it } from "vitest";
import {
  buildCombinations,
  parseCsv,
  renderTemplateText,
  scoreProgrammaticTemplate,
  summarizeDimensionMath,
  templateVariables,
  validateRows,
  type ProgrammaticTemplate,
} from "./programmatic";

const template: ProgrammaticTemplate = {
  id: "test",
  name: "Local",
  description: "",
  category: "Local SEO",
  titleTemplate: "Best {{service}} in {{city}}",
  wordRange: [300, 500],
  requiredVariables: ["service", "city"],
  sections: [
    { id: "title", type: "title", heading: "Best {{service}} in {{city}}", instructions: "" },
    { id: "intro", type: "introduction", heading: "{{city}} overview", instructions: "Cover {{service}} in {{city}}.", minWords: 80, maxWords: 120 },
    { id: "faq", type: "faq", heading: "{{city}} FAQ", instructions: "Answer questions.", minWords: 80, maxWords: 120, snippable: true },
  ],
};

describe("programmatic helpers", () => {
  it("extracts variables across templates", () => {
    expect(templateVariables(template)).toEqual(["service", "city"]);
  });

  it("renders row values", () => {
    expect(renderTemplateText("Best {{service}} in {{city}}", { service: "Plumbers", city: "Austin" })).toBe("Best Plumbers in Austin");
  });

  it("parses quoted csv", () => {
    const parsed = parseCsv("city,service\n\"Austin, TX\",Plumbers");
    expect(parsed.columns).toEqual(["city", "service"]);
    expect(parsed.rows[0].city).toBe("Austin, TX");
  });

  it("builds combinations", () => {
    expect(buildCombinations({ city: ["Austin", "Denver"], service: ["Plumbers"] })).toHaveLength(2);
  });

  it("summarizes dimensional keyword math", () => {
    expect(summarizeDimensionMath({ nutrient: 6, food: 100 }).label).toBe("nutrient 6 x food 100 = 600 articles");
    expect(summarizeDimensionMath({ food: 900 }).nearLimit).toBe(true);
    expect(summarizeDimensionMath({ food: 1001 }).overLimit).toBe(true);
  });

  it("validates missing row values", () => {
    expect(validateRows(template, [{ service: "Plumbers", city: "" }])[0]).toContain("city");
  });

  it("scores reusable structure", () => {
    expect(scoreProgrammaticTemplate(template).score).toBeGreaterThan(40);
  });
});
