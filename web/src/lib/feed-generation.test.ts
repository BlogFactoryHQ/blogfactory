import { describe, expect, it } from "vitest";
import { feedDraftQueueLabel, queueFeedDraftJobs } from "./feed-generation";

describe("queueFeedDraftJobs", () => {
  it("queues feed drafts sequentially", async () => {
    const offsets: number[] = [];
    const runs: Array<{ token: string; size: number; remaining: number }> = [];

    const result = await queueFeedDraftJobs(3, async (offset, run) => {
      offsets.push(offset);
      runs.push(run);
    });

    expect(offsets).toEqual([0, 1, 2]);
    expect(runs.map((run) => run.size)).toEqual([3, 3, 3]);
    expect(runs.map((run) => run.remaining)).toEqual([3, 2, 1]);
    expect(new Set(runs.map((run) => run.token)).size).toBe(1);
    expect(runs[0].token).toMatch(/^[0-9a-f-]{36}$/i);
    expect(result).toEqual({ queued: 3, failed: 0, total: 3 });
  });

  it("reports failed queue attempts with the feed draft total", async () => {
    await expect(queueFeedDraftJobs(3, async (offset) => {
      if (offset === 1) throw new Error("nope");
    })).rejects.toThrow("1/3 feed draft jobs failed to queue: nope");
  });
});

describe("feedDraftQueueLabel", () => {
  it("pluralizes draft job counts", () => {
    expect(feedDraftQueueLabel(1)).toBe("1 draft job");
    expect(feedDraftQueueLabel(3)).toBe("3 draft jobs");
  });
});
