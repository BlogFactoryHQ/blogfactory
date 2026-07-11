import assert from "node:assert/strict";
import { boundedRecentLimit, normalizeAnalyticsSummary, parseAnalyticsDateRange } from "./analytics-query.js";

assert.deepEqual(parseAnalyticsDateRange({}), {});
assert.equal(parseAnalyticsDateRange({ from: "2026-07-01", to: "2026-07-11T23:59:59Z" }).from?.toISOString(), "2026-07-01T00:00:00.000Z");
assert.equal(parseAnalyticsDateRange({ to: "2026-07-11" }).to?.toISOString(), "2026-07-11T23:59:59.999Z");
assert.throws(() => parseAnalyticsDateRange({ from: "invalid" }), /Invalid from date/);
assert.throws(() => parseAnalyticsDateRange({ from: "2026-07-12", to: "2026-07-11" }), /before/);
assert.equal(boundedRecentLimit(undefined), 25);
assert.equal(boundedRecentLimit("0"), 25);
assert.equal(boundedRecentLimit("500"), 100);
assert.deepEqual(normalizeAnalyticsSummary({
  totalCost: "0.06", textCost: "0.02", imageCost: "0.04", totalRequests: "4", failedCalls: "1",
  totalTokens: "1000", avgLatency: "250", postCount: "2",
}), {
  totalCost: 0.06, textCost: 0.02, imageCost: 0.04, totalRequests: 4, failedCalls: 1,
  totalTokens: 1000, avgLatency: 250, avgCostPerRequest: 0.015, avgCostPerPost: 0.03, postCount: 2,
});
assert.equal(normalizeAnalyticsSummary(undefined).avgCostPerRequest, 0);

console.log("analytics query self-check passed");
