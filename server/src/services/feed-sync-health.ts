import { getIntervalMs } from "./scheduler.js";

export type FeedSyncState = "running" | "paused" | "never" | "overdue" | "synced";

export type FeedHealthInput = {
  id: string;
  name: string;
  platform: string;
  frequency: string;
  isActive: boolean;
  lastRunAt: Date | null;
  runActiveCount: number;
  runLeaseUntil: Date | null;
  totalArticles: number | null;
};

export type FeedRunOutcome = {
  feedId: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: Date;
};

export type FeedSyncHealth = {
  feed_id: string;
  name: string;
  platform: string;
  state: FeedSyncState;
  frequency: string;
  /** What the operator asked for. */
  interval_ms: number;
  /** What the scheduler can actually deliver, since it only wakes up once per tick. */
  effective_interval_ms: number;
  last_run_at: string | null;
  next_due_at: string | null;
  /** Share of the effective window used since the last run. Above 1 means late. */
  window_progress: number | null;
  total_articles: number;
  runs_7d: number;
  failures_7d: number;
  last_error: string | null;
};

const DEFAULT_TICK_MS = 6 * 60 * 60 * 1000;
// The scheduler request itself takes time and ticks drift; this keeps a feed that is a few
// minutes behind a tick from flipping to "overdue".
const GRACE_MS = 15 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Both deployments wake the scheduler on a fixed tick (Cloudflare cron `0 *\/6 * * *`,
 * self-host `CRON_INTERVAL_SECONDS`, default 21600). A feed can never run more often than
 * that tick, so "hourly" really means "every tick". Health is judged against what the
 * scheduler can deliver, not against the label, otherwise every hourly feed reads as late.
 */
export function schedulerTickMs(env: Record<string, string | undefined> = process.env): number {
  const seconds = Number(env.CRON_INTERVAL_SECONDS);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_TICK_MS;
}

export function feedSyncHealth(
  feed: FeedHealthInput,
  outcomes: FeedRunOutcome[],
  now: Date,
  tickMs: number = DEFAULT_TICK_MS,
): FeedSyncHealth {
  const intervalMs = getIntervalMs(feed.frequency);
  const effectiveIntervalMs = Math.max(intervalMs, tickMs);
  const lastRun = feed.lastRunAt ? new Date(feed.lastRunAt) : null;
  const leaseLive = Boolean(feed.runLeaseUntil && new Date(feed.runLeaseUntil).getTime() > now.getTime());

  const elapsed = lastRun ? now.getTime() - lastRun.getTime() : null;
  const windowProgress = elapsed === null ? null : elapsed / effectiveIntervalMs;

  let state: FeedSyncState;
  if (feed.runActiveCount > 0 && leaseLive) state = "running";
  else if (!feed.isActive) state = "paused";
  else if (!lastRun) state = "never";
  // Late only once the run has missed its window *and* the tick that should have caught it.
  else if (elapsed! > intervalMs + tickMs + GRACE_MS) state = "overdue";
  else state = "synced";

  const weekStart = now.getTime() - WEEK_MS;
  const recent = outcomes
    .filter((outcome) => outcome.feedId === feed.id && new Date(outcome.createdAt).getTime() >= weekStart)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const failed = recent.filter((outcome) => outcome.status === "failed");

  return {
    feed_id: feed.id,
    name: feed.name,
    platform: feed.platform,
    state,
    frequency: feed.frequency,
    interval_ms: intervalMs,
    effective_interval_ms: effectiveIntervalMs,
    last_run_at: lastRun ? lastRun.toISOString() : null,
    next_due_at: lastRun && feed.isActive ? new Date(lastRun.getTime() + intervalMs).toISOString() : null,
    window_progress: windowProgress === null ? null : Math.max(0, windowProgress),
    total_articles: feed.totalArticles ?? 0,
    runs_7d: recent.length,
    failures_7d: failed.length,
    last_error: failed[0]?.errorMessage ?? null,
  };
}

export type FeedHealthSummary = {
  total: number;
  on_schedule: number;
  overdue: number;
  paused: number;
  never: number;
  running: number;
  tick_ms: number;
};

export function summarizeFeedHealth(entries: FeedSyncHealth[], tickMs: number): FeedHealthSummary {
  const count = (state: FeedSyncState) => entries.filter((entry) => entry.state === state).length;
  return {
    total: entries.length,
    // A running feed is on schedule by definition: it is being served right now.
    on_schedule: count("synced") + count("running"),
    overdue: count("overdue"),
    paused: count("paused"),
    never: count("never"),
    running: count("running"),
    tick_ms: tickMs,
  };
}
