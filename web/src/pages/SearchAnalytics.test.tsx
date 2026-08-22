import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SearchAnalyticsPanel } from "./SearchAnalytics";

const analytics = {
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  data: {
    input: { range: 28, compare: true, groupBy: "query", searchType: "web", includePreliminary: false },
    range: { startDate: "2026-07-24", endDate: "2026-08-20", baselineStart: "2026-06-26", baselineEnd: "2026-07-23" },
    totals: {
      clicks: { value: 524, baseline: 400, delta: 124, deltaPercent: 0.31 },
      impressions: { value: 55102, baseline: 50000, delta: 5102, deltaPercent: 0.102 },
      ctr: { value: 0.0095, baseline: 0.008, delta: 0.0015, deltaPercent: 0.1875 },
      position: { value: 10, baseline: 11, delta: -1, deltaPercent: -0.0909 },
    },
    daily: [],
    rows: [],
    metadata: { first_incomplete_date: "2026-08-21" },
    provenance: {
      source: "google_search_console_api",
      property: "sc-domain:example.com",
      scope: "site_total",
      fetched_at: "2026-08-22T16:00:00.000Z",
      complete_through: "2026-08-20",
      first_incomplete_date: "2026-08-21",
      data_status: "complete",
      cache: "live",
    },
    cached: false,
  },
};

vi.mock("@/hooks/useSites", () => ({ useSites: () => ({ activeSiteId: "site-1" }) }));
vi.mock("@/hooks/useSearchConsole", () => ({
  useSearchConsole: () => ({ integration: { id: "gsc-1", status: "connected" } }),
  useSearchConsoleToolkit: () => ({ analytics }),
}));

describe("SearchAnalyticsPanel", () => {
  it("shows preliminary control and canonical provenance", () => {
    const warnings = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const html = renderToStaticMarkup(<SearchAnalyticsPanel />);
    warnings.mockRestore();
    expect(html).toContain("Include preliminary data");
    expect(html).toContain("Google Search Console API");
    expect(html).toContain("Complete through 2026-08-20");
    expect(html).toContain("524");
  });
});
