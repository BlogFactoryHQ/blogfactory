import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { parseDraftProgress, type JobTerminalResult, useJobTracker } from "./useJobTracker";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/api", () => ({ api: { get: vi.fn() } }));

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.mocked(api.get).mockReset();
  vi.useRealTimers();
});

describe("parseDraftProgress", () => {
  it("reads current draft from backend step names", () => {
    expect(parseDraftProgress("generating_draft_2_of_5", { totalDrafts: 5 }, ["a"])).toMatchObject({
      current: 2,
      total: 5,
      completed: 1,
    });

    expect(parseDraftProgress("repairing_length_for_draft_3", { totalDrafts: 5 }, ["a", "b"])).toMatchObject({
      current: 3,
      total: 5,
      completed: 2,
    });

    expect(parseDraftProgress("resolving_images_for_draft_4", { totalDrafts: 5 }, ["a", "b", "c", "d"])).toMatchObject({
      current: 4,
      total: 5,
      completed: 4,
    });
  });

  it("returns post ids, actual cost, and timing when a tracked job completes", async () => {
    vi.mocked(api.get).mockResolvedValue({
      status: "completed",
      current_step: "completed_post_1_of_1",
      result_post_ids: ["post-1"],
      total_cost: 0.037,
      created_at: "2026-08-24T00:00:00.000Z",
      completed_at: "2026-08-24T00:00:38.000Z",
    });
    let result: JobTerminalResult | null = null;

    function Harness() {
      const tracker = useJobTracker((next) => { result = next; });
      return createElement("button", {
        onClick: () => tracker.startJob({ jobId: "job-1", sourceType: "article_keyword", sourceLabel: "Legal tech", variations: 1 }),
      }, "Start");
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(Harness)));
    await act(async () => container?.querySelector("button")?.click());
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    expect(result).toEqual({
      jobId: "job-1",
      status: "completed",
      postIds: ["post-1"],
      totalCost: 0.037,
      createdAt: "2026-08-24T00:00:00.000Z",
      completedAt: "2026-08-24T00:00:38.000Z",
      error: "",
    });
  });

  it("keeps tracking after a transient polling error", async () => {
    vi.useFakeTimers();
    vi.mocked(api.get)
      .mockRejectedValueOnce(new Error("Temporary network error"))
      .mockResolvedValueOnce({
        status: "completed",
        current_step: "completed_post_1_of_1",
        result_post_ids: ["post-1"],
        total_cost: 0.02,
      });
    let result: JobTerminalResult | null = null;

    function Harness() {
      const tracker = useJobTracker((next) => { result = next; });
      return createElement("button", {
        onClick: () => tracker.startJob({ jobId: "job-1", sourceType: "article_keyword", sourceLabel: "Legal tech", variations: 1 }),
      }, "Start");
    }

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root?.render(createElement(Harness)));
    await act(async () => container?.querySelector("button")?.click());
    await act(async () => { await Promise.resolve(); });
    expect(api.get).toHaveBeenCalledTimes(1);

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: "completed", postIds: ["post-1"] });
  });
});
