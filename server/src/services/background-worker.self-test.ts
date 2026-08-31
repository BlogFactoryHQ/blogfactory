import assert from "node:assert/strict";
import { readBackgroundWorkerConfig, runBackgroundWorkerCycle } from "./background-worker.js";

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

console.log("background worker self-test passed");
