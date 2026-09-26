import assert from "node:assert/strict";
import {
  createPeriodicScheduler,
  DAILY_INTERVAL_MS,
  FEEDS_INTERVAL_MS,
  readBackgroundWorkerConfig,
  runBackgroundWorkerCycle,
} from "./background-worker.js";

assert.deepEqual(readBackgroundWorkerConfig({}), {
  pollMs: 5_000,
  campaignItems: 1,
  seoJobs: 2,
  imageJobs: 1,
  heartbeatFile: "/tmp/blogfactory-worker-heartbeat",
  heartbeatUrl: undefined,
});

const config = readBackgroundWorkerConfig({
  BACKGROUND_WORKER_POLL_MS: "1",
  BACKGROUND_WORKER_CAMPAIGN_ITEMS: "99",
  BACKGROUND_WORKER_SEO_JOBS: "3",
  BACKGROUND_WORKER_IMAGE_JOBS: "2",
  BACKGROUND_WORKER_HEARTBEAT_URL: " https://example.com/heartbeat ",
});
assert.deepEqual(config, {
  pollMs: 1_000,
  campaignItems: 10,
  seoJobs: 3,
  imageJobs: 2,
  heartbeatFile: "/tmp/blogfactory-worker-heartbeat",
  heartbeatUrl: "https://example.com/heartbeat",
});

const calls: string[] = [];
assert.deepEqual(await runBackgroundWorkerCycle(config, {
  campaigns: async (campaigns, items) => { calls.push(`campaigns:${campaigns}:${items}`); },
  seo: async (_userId, limit) => { calls.push(`seo:${limit}`); },
  images: async () => { calls.push("images"); },
}), { ok: true, failed: [] });
assert.deepEqual(calls.sort(), ["campaigns:1:10", "images", "images", "seo:3"]);

assert.deepEqual(await runBackgroundWorkerCycle(config, {
  campaigns: async () => {},
  seo: async () => { throw new Error("hidden provider detail"); },
  images: async () => {},
}), { ok: false, failed: ["seo"] });

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
let clock = 0;
let releaseDaily = () => {};
const periodicRuns: string[] = [];
const periodic = createPeriodicScheduler([
  { name: "feeds", intervalMs: FEEDS_INTERVAL_MS, run: async () => { periodicRuns.push("feeds"); } },
  {
    name: "daily",
    intervalMs: DAILY_INTERVAL_MS,
    run: () => new Promise<void>((resolve) => { periodicRuns.push("daily"); releaseDaily = resolve; }),
  },
], () => clock);
assert.deepEqual(periodic.tick(), ["feeds", "daily"], "periodic tasks are due on worker start");
await settle();
clock = 5_000;
assert.deepEqual(periodic.tick(), [], "periodic tasks wait for their interval");
clock = FEEDS_INTERVAL_MS;
assert.deepEqual(periodic.tick(), ["feeds"], "feeds run every six hours");
clock = DAILY_INTERVAL_MS;
await settle();
assert.deepEqual(periodic.tick(), ["feeds"], "an unfinished daily run is never started twice");
releaseDaily();
await settle();
assert.deepEqual(periodic.tick(), ["daily"]);
assert.deepEqual(periodicRuns, ["feeds", "daily", "feeds", "feeds", "daily"]);

const failing = createPeriodicScheduler([
  { name: "feeds", intervalMs: FEEDS_INTERVAL_MS, run: async () => { throw new Error("hidden provider detail"); } },
], () => 0);
assert.deepEqual(failing.tick(), ["feeds"]);
await settle();
assert.deepEqual(failing.tick(), [], "a failed task waits for its next interval");

console.log("background worker self-test passed");
