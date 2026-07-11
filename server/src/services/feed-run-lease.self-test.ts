import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";

const {
  feedRunLeaseMs,
  normalizeFeedRunSlots,
  remainingFeedRunSlots,
} = await import("./feed-run-lease.js");

assert.equal(feedRunLeaseMs(undefined), 15 * 60 * 1000);
assert.equal(feedRunLeaseMs("30"), 30 * 60 * 1000);
assert.equal(feedRunLeaseMs("999"), 120 * 60 * 1000);
assert.equal(normalizeFeedRunSlots(undefined), 1);
assert.equal(normalizeFeedRunSlots(3), 3);
assert.equal(normalizeFeedRunSlots(50), 20);
assert.equal(remainingFeedRunSlots(3, 1), 2);
assert.equal(remainingFeedRunSlots(3, 5), 0);

console.log("feed run lease self-check passed");
