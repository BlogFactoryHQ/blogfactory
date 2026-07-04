export type FeedDraftQueueResult = {
  queued: number;
  failed: number;
  total: number;
};

export async function queueFeedDraftJobs(
  total: number,
  queueOneDraft: (feedItemOffset: number) => Promise<unknown>
): Promise<FeedDraftQueueResult> {
  const safeTotal = Math.max(1, Math.floor(Number(total) || 1));
  let queued = 0;
  let failed = 0;

  for (let index = 0; index < safeTotal; index += 1) {
    try {
      await queueOneDraft(index);
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
