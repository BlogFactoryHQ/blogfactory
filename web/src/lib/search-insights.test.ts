import { describe, expect, it } from "vitest";
import { bucketBubbleSize, classifyTrend, formatCompactNumber, formatDelta } from "./search-insights";

describe("search insight helpers", () => {
  it("formats large numbers for scanning", () => {
    expect(formatCompactNumber(302016)).toBe("302K");
    expect(formatCompactNumber(2156)).toBe("2.2K");
    expect(formatCompactNumber(98)).toBe("98");
  });

  it("buckets conceptual bubbles into fixed sizes", () => {
    expect(bucketBubbleSize(80, 100)).toBe("lg");
    expect(bucketBubbleSize(30, 100)).toBe("md");
    expect(bucketBubbleSize(5, 100)).toBe("sm");
  });

  it("treats lower average position as better", () => {
    expect(classifyTrend(-2, true)).toBe("good");
    expect(classifyTrend(2, true)).toBe("bad");
    expect(formatDelta(null).label).toBe("baseline building");
  });
});
