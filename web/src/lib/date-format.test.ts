import { describe, expect, it } from "vitest";
import { safeDate, safeFormatDate, safeFormatDistanceToNow, safeFormatIsoDate, safeLocaleString } from "./date-format";

describe("safe date formatting", () => {
  it("returns fallbacks for invalid dates", () => {
    expect(safeDate("not-a-date")).toBeNull();
    expect(safeFormatDate("not-a-date", "MMM d")).toBe("—");
    expect(safeFormatDistanceToNow("not-a-date")).toBe("—");
    expect(safeLocaleString("not-a-date")).toBe("—");
    expect(safeFormatIsoDate("not-a-date", "MMM d")).toBe("—");
  });

  it("formats valid dates", () => {
    expect(safeFormatDate("2026-07-04T20:00:00Z", "yyyy-MM-dd")).toBe("2026-07-04");
    expect(safeFormatIsoDate("2026-07-04", "yyyy-MM-dd")).toBe("2026-07-04");
  });
});
