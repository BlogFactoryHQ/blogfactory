import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";

const { evaluateDailyGuardrails, normalizeGuardrailLimit } = await import("./generation-guardrails.js");

const quiet = { monthSpend: 12, todaySpend: 1.5, todayRequests: 20, todayFailures: 0 };

// No limits configured means nothing blocks.
assert.equal(evaluateDailyGuardrails({}, quiet), null);
assert.equal(evaluateDailyGuardrails({ dailyCostLimit: null, dailyRequestLimit: null }, quiet), null);

// Under a configured ceiling still runs.
assert.equal(evaluateDailyGuardrails({ dailyCostLimit: 5 }, quiet), null);

// At or above the ceiling blocks, and the message names the real numbers.
const blockedByCost = evaluateDailyGuardrails({ dailyCostLimit: 1.5 }, quiet);
assert.equal(blockedByCost?.id, "daily_cost");
assert.match(blockedByCost!.message, /\$1\.50 of \$1\.50 today/);

const blockedByRequests = evaluateDailyGuardrails({ dailyRequestLimit: 20 }, quiet);
assert.equal(blockedByRequests?.id, "daily_requests");
assert.match(blockedByRequests!.message, /20 of 20 model calls/);

// Cost is reported first when both ceilings are breached, so the message matches the stricter cause.
assert.equal(evaluateDailyGuardrails({ dailyCostLimit: 1, dailyRequestLimit: 1 }, quiet)?.id, "daily_cost");

// A failure ceiling never blocks generation; a provider outage must not become an account outage.
assert.equal(evaluateDailyGuardrails({ dailyFailureLimit: 1 }, { ...quiet, todayFailures: 99 }), null);

// Non-positive or unparseable thresholds are treated as off rather than as an instant block.
assert.equal(evaluateDailyGuardrails({ dailyCostLimit: 0 }, quiet), null);
assert.equal(evaluateDailyGuardrails({ dailyCostLimit: Number.NaN }, quiet), null);
assert.equal(evaluateDailyGuardrails({ dailyRequestLimit: -4 }, quiet), null);

assert.equal(normalizeGuardrailLimit("", "cost"), null);
assert.equal(normalizeGuardrailLimit(null, "count"), null);
assert.equal(normalizeGuardrailLimit(0, "cost"), null);
assert.equal(normalizeGuardrailLimit(-2, "count"), null);
assert.equal(normalizeGuardrailLimit("7.5", "cost"), 7.5);
assert.equal(normalizeGuardrailLimit("7.9", "count"), 7);
assert.equal(normalizeGuardrailLimit(12, "count"), 12);

console.log("generation-guardrails self-test passed");
