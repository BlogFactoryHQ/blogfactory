import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SourceSyncHealth, type FeedHealthResponse, type FeedSyncHealth } from "./SourceSyncHealth";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: apiMocks.get } }));

const HOUR = 60 * 60 * 1000;
const TICK = 6 * HOUR;

function feed(overrides: Partial<FeedSyncHealth>): FeedSyncHealth {
  return {
    feed_id: "feed",
    name: "Feed",
    platform: "rss",
    state: "synced",
    frequency: "daily",
    interval_ms: 24 * HOUR,
    effective_interval_ms: 24 * HOUR,
    last_run_at: new Date(Date.now() - 2 * HOUR).toISOString(),
    next_due_at: null,
    window_progress: 0.1,
    total_articles: 12,
    runs_7d: 3,
    failures_7d: 0,
    last_error: null,
    ...overrides,
  };
}

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function render(response: FeedHealthResponse | Error) {
  // retryOnMount off so a seeded failure is shown as-is instead of being reset into a refetch.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
  if (response instanceof Error) {
    // Seed a failed read directly. A real rejected fetch leaks an unhandled rejection into
    // vitest's jsdom worker even though React Query handles it, and fails the test spuriously.
    apiMocks.get.mockResolvedValue({ summary: { total: 0, on_schedule: 0, overdue: 0, paused: 0, never: 0, running: 0, tick_ms: TICK }, feeds: [] });
    const query = client.getQueryCache().build(client, { queryKey: ["feeds", "health"] });
    query.setState({ status: "error", error: response, errorUpdatedAt: Date.now(), fetchStatus: "idle" });
  } else {
    apiMocks.get.mockResolvedValue(response);
  }
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<QueryClientProvider client={client}><SourceSyncHealth /></QueryClientProvider>);
  });
  for (let attempt = 0; attempt < 20 && container.querySelector('[class*="animate-pulse"]'); attempt += 1) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

beforeEach(() => apiMocks.get.mockReset());

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  container?.remove();
  root = null;
  container = null;
});

describe("SourceSyncHealth", () => {
  it("reads the health endpoint and reports how many sources are on schedule", async () => {
    await render({
      summary: { total: 3, on_schedule: 1, overdue: 1, paused: 1, never: 0, running: 0, tick_ms: TICK },
      feeds: [
        feed({ feed_id: "a", name: "Product blog" }),
        feed({ feed_id: "b", name: "Changelog", state: "overdue", window_progress: 1.4, failures_7d: 2, last_error: "Timed out" }),
        feed({ feed_id: "c", name: "Old news", state: "paused" }),
      ],
    });

    expect(apiMocks.get).toHaveBeenCalledWith("/feeds/health");
    expect(container!.textContent).toContain("1 of 3");
    expect(container!.textContent).toContain("Overdue");
    expect(container!.textContent).toContain("2 failed this week");
    // The latest failure message is reachable without opening the run.
    expect(container!.querySelector('[title="Timed out"]')).not.toBeNull();
  });

  it("explains when the scheduler tick throttles a faster schedule", async () => {
    await render({
      summary: { total: 1, on_schedule: 1, overdue: 0, paused: 0, never: 0, running: 0, tick_ms: TICK },
      feeds: [feed({ frequency: "hourly", interval_ms: HOUR, effective_interval_ms: TICK })],
    });
    expect(container!.textContent).toContain("The scheduler wakes every 6 h");
    expect(container!.textContent).toContain("actually runs once per 6 h");
  });

  it("does not claim throttling for a paused feed or one slower than the tick", async () => {
    await render({
      summary: { total: 2, on_schedule: 1, overdue: 0, paused: 1, never: 0, running: 0, tick_ms: TICK },
      feeds: [
        feed({ feed_id: "a" }),
        feed({ feed_id: "b", state: "paused", frequency: "hourly", interval_ms: HOUR, effective_interval_ms: TICK }),
      ],
    });
    expect(container!.textContent).not.toContain("The scheduler wakes");
  });

  it("shows an empty state when there are no sources", async () => {
    await render({ summary: { total: 0, on_schedule: 0, overdue: 0, paused: 0, never: 0, running: 0, tick_ms: TICK }, feeds: [] });
    expect(container!.textContent).toContain("No sources yet");
  });

  it("shows an error state when the health read fails", async () => {
    await render(new Error("HTTP 500"));
    expect(container!.textContent).toContain("Source health could not be loaded");
    expect(container!.textContent).toContain("HTTP 500");
  });
});
