import { describe, expect, it } from "vitest";
import {
  bucketBubbleSize,
  classifyTrend,
  formatCompactCurrency,
  formatCompactNumber,
  formatDelta,
  formatDuration,
  safePercent,
  topBuckets,
} from "./search-insights";

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

  it("formats spend and latency for pulse cards", () => {
    expect(formatCompactCurrency(0)).toBe("$0.00");
    expect(formatCompactCurrency(0.003)).toBe("<$0.01");
    expect(formatCompactCurrency(12.3456)).toBe("$12.35");
    expect(formatDuration(850)).toBe("850ms");
    expect(formatDuration(1550)).toBe("1.6s");
  });

  it("keeps percentages bounded and buckets sorted", () => {
    expect(safePercent(5, 10)).toBe(50);
    expect(safePercent(5, 0)).toBe(0);
    expect(safePercent(50, 10)).toBe(100);
    expect(topBuckets(["rss", "url", "rss"], (item) => item)).toEqual([
      { label: "rss", value: 2 },
      { label: "url", value: 1 },
    ]);
  });
});
