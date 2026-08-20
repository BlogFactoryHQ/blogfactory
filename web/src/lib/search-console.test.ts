import { describe, expect, it } from "vitest";
import { searchConsoleCountryLabel, toggleInspectionSelection } from "./search-console";

describe("Search Console UI helpers", () => {
  it("labels observed country codes without a dependency", () => {
    expect(searchConsoleCountryLabel("tr")).toMatch(/Türkiye|Turkey/);
  });

  it("caps batch inspection selection at ten unique URLs", () => {
    const ten = Array.from({ length: 10 }, (_, index) => `https://example.com/${index}`);
    expect(toggleInspectionSelection(ten, "https://example.com/10", true)).toEqual({ urls: ten, limited: true });
    expect(toggleInspectionSelection(ten, ten[0], false).urls).toHaveLength(9);
  });
});
