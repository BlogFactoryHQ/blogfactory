import assert from "node:assert/strict";
import { compensateAfterLocalFailure, partitionSettled, publishingFailureState } from "./atomic-state.js";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";

const { publishingIdempotencyKey } = await import("./publishing.js");
const request = {
  userId: "00000000-0000-0000-0000-000000000001",
  postId: "00000000-0000-0000-0000-000000000002",
  integrationId: "00000000-0000-0000-0000-000000000003",
  postUpdatedAt: new Date("2026-07-11T10:00:00Z"),
  options: { mode: "publish" as const, tags: ["one", "two"], publishingMetadata: { b: 2, a: 1 } },
};

const concurrentKeys = await Promise.all(Array.from({ length: 10 }, async () => publishingIdempotencyKey(request)));
assert.equal(new Set(concurrentKeys).size, 1, "concurrent identical requests share one reservation key");
assert.equal(
  publishingIdempotencyKey(request),
  publishingIdempotencyKey({ ...request, options: { mode: "publish", tags: ["one", "two"], publishingMetadata: { a: 1, b: 2 } } }),
  "object key order does not alter idempotency",
);
assert.notEqual(
  publishingIdempotencyKey(request),
  publishingIdempotencyKey({ ...request, postUpdatedAt: new Date("2026-07-11T10:01:00Z") }),
  "edited posts create a new publish operation",
);

assert.deepEqual(publishingFailureState(false, new Error("provider failed")), {
  status: "failed",
  errorMessage: "provider failed",
  publicError: "provider failed",
});
assert.equal(publishingFailureState(true, new Error("commit failed")).status, "reconciliation_required");

let cleanupCalls = 0;
await assert.rejects(
  compensateAfterLocalFailure(new Error("insert failed"), async () => { cleanupCalls += 1; }, "metadata failed"),
  /insert failed/,
);
assert.equal(cleanupCalls, 1, "a failed local write compensates its external write once");
await assert.rejects(
  compensateAfterLocalFailure(new Error("insert failed"), async () => { throw new Error("delete failed"); }, "metadata failed"),
  /cleanup also failed \(delete failed\)/,
);

const deletion = partitionSettled(
  [{ id: "removed" }, { id: "retained" }],
  [{ status: "fulfilled", value: undefined }, { status: "rejected", reason: new Error("R2 unavailable") }],
);
assert.deepEqual(deletion.completed, [{ id: "removed" }]);
assert.deepEqual(deletion.failed, [{ item: { id: "retained" }, error: "R2 unavailable" }]);

console.log("atomic external-state self-check passed");
