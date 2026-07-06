import assert from "node:assert/strict";
import { staleTimeoutUpdateForJob } from "../services/job-timeouts.js";

function plan(update: ReturnType<typeof staleTimeoutUpdateForJob>) {
  return update.generationPlan as { totalDrafts: number; failedDrafts?: Array<{ index: number; error: string }> };
}

const partial = staleTimeoutUpdateForJob({
  generationPlan: { totalDrafts: 3 },
  resultPostIds: ["post-1"],
});

assert.equal(partial.status, "completed");
assert.equal(partial.currentStep, "done");
assert.equal(partial.errorMessage, null);
assert.equal(plan(partial).totalDrafts, 3);
assert.deepEqual(plan(partial).failedDrafts, [
  {
    index: 1,
    error: "Generation timed out after 1/3 drafts were created. The remaining drafts did not finish; try a faster model or fewer variations.",
  },
  {
    index: 2,
    error: "Generation timed out after 1/3 drafts were created. The remaining drafts did not finish; try a faster model or fewer variations.",
  },
]);

const failed = staleTimeoutUpdateForJob({
  generationPlan: { totalDrafts: 3 },
  resultPostIds: [],
});

assert.equal(failed.status, "failed");
assert.equal(failed.currentStep, "timeout");
assert.equal(plan(failed).failedDrafts?.length, 3);
assert.match(failed.errorMessage, /Text model did not return/);

const failedDuringModelCall = staleTimeoutUpdateForJob({
  generationPlan: { totalDrafts: 1 },
  resultPostIds: [],
  currentStep: "generating_draft_1_of_1",
});

assert.equal(failedDuringModelCall.status, "failed");
assert.match(failedDuringModelCall.errorMessage, /Text model did not return/);
assert.match(plan(failedDuringModelCall).failedDrafts?.[0]?.error || "", /Text model did not return/);

const completed = staleTimeoutUpdateForJob({
  generationPlan: { totalDrafts: 2 },
  resultPostIds: ["post-1", "post-2"],
});

assert.equal(completed.status, "completed");
assert.equal(completed.errorMessage, null);
assert.equal(plan(completed).totalDrafts, 2);
assert.equal(plan(completed).failedDrafts, undefined);

const preserved = staleTimeoutUpdateForJob({
  generationPlan: {
    totalDrafts: 3,
    failedDrafts: [{ index: 1, error: "Model refused this draft." }],
  },
  resultPostIds: ["post-1"],
});

assert.equal(preserved.status, "completed");
assert.deepEqual(plan(preserved).failedDrafts, [
  { index: 1, error: "Model refused this draft." },
  {
    index: 2,
    error: "Generation timed out after 1/3 drafts were created. The remaining drafts did not finish; try a faster model or fewer variations.",
  },
]);

console.log("jobs stale timeout self-test passed");
