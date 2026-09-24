import { describe, expect, it } from "vitest";

import { formatSourceType } from "./source-labels";

describe("formatSourceType", () => {
  it("keeps acronyms and brand names", () => {
    expect(formatSourceType("rss")).toBe("RSS");
    expect(formatSourceType("rss_feed")).toBe("RSS");
    expect(formatSourceType("youtube")).toBe("YouTube");
    expect(formatSourceType("mcp_batch_import")).toBe("MCP batch import");
  });

  it("sentence-cases unknown values and handles empties", () => {
    expect(formatSourceType("some_new_source")).toBe("Some new source");
    expect(formatSourceType(null)).toBe("—");
  });
});
