export type FeedDraftQueueResult = {
  queued: number;
  failed: number;
  total: number;
};

export type FeedRunBatch = {
  token: string;
  size: number;
  remaining: number;
};

export async function queueFeedDraftJobs(
  total: number,
  queueOneDraft: (feedItemOffset: number, run: FeedRunBatch) => Promise<unknown>
): Promise<FeedDraftQueueResult> {
  const safeTotal = Math.max(1, Math.floor(Number(total) || 1));
  const run = { token: crypto.randomUUID(), size: safeTotal };
  let queued = 0;
  let failed = 0;

  for (let index = 0; index < safeTotal; index += 1) {
    try {
      await queueOneDraft(index, { ...run, remaining: safeTotal - index });
      queued += 1;
    } catch {
      failed += 1;
    }
  }

  if (failed) {
    throw new Error(`${failed}/${safeTotal} feed draft job${safeTotal === 1 ? "" : "s"} failed to queue`);
  }

  return { queued, failed, total: safeTotal };
}

export function feedDraftQueueLabel(count: number) {
  return `${count} draft job${count === 1 ? "" : "s"}`;
}
