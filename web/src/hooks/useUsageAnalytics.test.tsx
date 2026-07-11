import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useUsageAnalytics } from "./useUsageAnalytics";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@/lib/api", () => ({ api: { get: getMock } }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function Harness() {
  useUsageAnalytics(30);
  return null;
}

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.clearAllMocks();
});

describe("useUsageAnalytics", () => {
  it("loads one aggregate report without downloading raw usage logs", async () => {
    getMock.mockImplementation(async (path: string) => path === "/analytics/openrouter-usage" ? null : {
      summary: { totalCost: 0, textCost: 0, imageCost: 0, totalTokens: 0, totalRequests: 0, avgLatency: 0, avgCostPerRequest: 0, avgCostPerPost: 0, postCount: 0, failedCalls: 0 },
      providerBreakdown: [], modelBreakdown: [], daily: [], recentCalls: [], imageSummary: { total: 0, ai: 0, stock: 0, source: 0, cover: 0, inline: 0, totalCost: 0, queued: 0, failed: 0, retries: 0 },
      imageBreakdown: [], monthToDateSpend: 0,
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>);
    });
    await act(async () => {
      await vi.waitFor(() => expect(getMock).toHaveBeenCalledTimes(2));
    });

    const paths = getMock.mock.calls.map(([path]) => String(path));
    expect(paths.some((path) => path.startsWith("/analytics/costs?from="))).toBe(true);
    expect(paths).toContain("/analytics/openrouter-usage");
    expect(paths.some((path) => path.startsWith("/analytics/usage"))).toBe(false);
  });
});
