import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";

const { feedSyncHealth, schedulerTickMs, summarizeFeedHealth } = await import("./feed-sync-health.js");

const HOUR = 60 * 60 * 1000;
const TICK = 6 * HOUR;
const now = new Date("2026-09-21T12:00:00.000Z");
const ago = (ms: number) => new Date(now.getTime() - ms);

const base = {
  id: "feed-1",
  name: "Product blog",
  platform: "rss",
  frequency: "daily",
  isActive: true,
  lastRunAt: ago(2 * HOUR),
  runActiveCount: 0,
  runLeaseUntil: null,
  totalArticles: 40,
};

// Tick resolution follows the deployment, with the documented 6 h default.
assert.equal(schedulerTickMs({}), TICK);
assert.equal(schedulerTickMs({ CRON_INTERVAL_SECONDS: "3600" }), HOUR);
assert.equal(schedulerTickMs({ CRON_INTERVAL_SECONDS: "nope" }), TICK);

// A recent daily run is synced, a fraction of the way through its window.
const synced = feedSyncHealth(base, [], now, TICK);
assert.equal(synced.state, "synced");
assert.ok(synced.window_progress! > 0 && synced.window_progress! < 0.2);
assert.equal(synced.next_due_at, new Date(base.lastRunAt.getTime() + 24 * HOUR).toISOString());

// An hourly feed is only served once per tick; five hours since its last run is on time,
// even though the label says "hourly". Its window is the tick, not an hour.
const hourly = feedSyncHealth({ ...base, frequency: "hourly", lastRunAt: ago(5 * HOUR) }, [], now, TICK);
assert.equal(hourly.state, "synced");
assert.equal(hourly.interval_ms, HOUR);
assert.equal(hourly.effective_interval_ms, TICK);

// It becomes overdue only after missing both its interval and the tick that should have caught it.
assert.equal(feedSyncHealth({ ...base, frequency: "hourly", lastRunAt: ago(7 * HOUR + 20 * 60 * 1000) }, [], now, TICK).state, "overdue");
assert.equal(feedSyncHealth({ ...base, lastRunAt: ago(30 * HOUR) }, [], now, TICK).state, "synced");
assert.equal(feedSyncHealth({ ...base, lastRunAt: ago(31 * HOUR) }, [], now, TICK).state, "overdue");

// Paused beats overdue: an operator switching a feed off is not a failure.
const paused = feedSyncHealth({ ...base, isActive: false, lastRunAt: ago(90 * HOUR) }, [], now, TICK);
assert.equal(paused.state, "paused");
assert.equal(paused.next_due_at, null);

// Never-run feeds are called out rather than treated as late.
const never = feedSyncHealth({ ...base, lastRunAt: null }, [], now, TICK);
assert.equal(never.state, "never");
assert.equal(never.window_progress, null);

// Running needs a live lease; a stale counter left behind by a crashed run does not count.
assert.equal(feedSyncHealth({ ...base, runActiveCount: 2, runLeaseUntil: new Date(now.getTime() + 60_000) }, [], now, TICK).state, "running");
assert.equal(feedSyncHealth({ ...base, runActiveCount: 2, runLeaseUntil: ago(60_000) }, [], now, TICK).state, "synced");

// Outcomes are scoped to this feed and the last seven days, newest failure first.
const outcomes = [
  { feedId: "feed-1", status: "completed", errorMessage: null, createdAt: ago(1 * HOUR) },
  { feedId: "feed-1", status: "failed", errorMessage: "older failure", createdAt: ago(40 * HOUR) },
  { feedId: "feed-1", status: "failed", errorMessage: "latest failure", createdAt: ago(10 * HOUR) },
  { feedId: "feed-1", status: "failed", errorMessage: "outside window", createdAt: ago(8 * 24 * HOUR) },
  { feedId: "feed-2", status: "failed", errorMessage: "other feed", createdAt: ago(1 * HOUR) },
];
const withRuns = feedSyncHealth(base, outcomes, now, TICK);
assert.equal(withRuns.runs_7d, 3);
assert.equal(withRuns.failures_7d, 2);
assert.equal(withRuns.last_error, "latest failure");

const summary = summarizeFeedHealth([
  synced,
  hourly,
  paused,
  never,
  feedSyncHealth({ ...base, lastRunAt: ago(40 * HOUR) }, [], now, TICK),
  feedSyncHealth({ ...base, runActiveCount: 1, runLeaseUntil: new Date(now.getTime() + 60_000) }, [], now, TICK),
], TICK);
assert.deepEqual(summary, { total: 6, on_schedule: 3, overdue: 1, paused: 1, never: 1, running: 1, tick_ms: TICK });

console.log("feed-sync-health self-test passed");
