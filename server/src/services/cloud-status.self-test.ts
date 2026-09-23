import assert from "node:assert/strict";
import { summarizeCloudStatus, type CloudStatusSnapshot } from "./cloud-status.js";

const healthy: CloudStatusSnapshot = {
  dependenciesReady: true,
  billing: { pending: 0, failed: 0, oldestPendingAt: null, lastProcessedAt: null },
  jobs: { queued: 0, running: 0, stuck: 0, failed24h: 0, completed24h: 3 },
  searchConsole: { total: 1, errors: 0, stale: 0, neverSynced: 0 },
  monitoring: { workerHeartbeatConfigured: true },
};

assert.equal(summarizeCloudStatus(healthy).state, "healthy");
assert.equal(summarizeCloudStatus({ ...healthy, jobs: { ...healthy.jobs, stuck: 1 } }).state, "unavailable");
assert.equal(summarizeCloudStatus({ ...healthy, monitoring: { workerHeartbeatConfigured: false } }).state, "attention");
assert.equal(summarizeCloudStatus({ ...healthy, searchConsole: { total: 1, errors: 1, stale: 0, neverSynced: 0 } }).state, "attention");

console.log("cloud status self-check passed");
