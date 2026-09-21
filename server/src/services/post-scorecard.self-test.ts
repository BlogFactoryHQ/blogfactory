import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";

const { scoreRevisions } = await import("./post-scorecard.js");

const thin = "Short body without structure.";
const rich = [
  "# Seat billing for pending invites",
  "",
  "Seat billing counts a pending invite as a seat until it expires. Contact support to confirm an invoice line.",
  "",
  "## How seats are counted",
  "",
  "A pending invite holds a seat.",
  "",
  "## FAQ",
  "",
  "### Does a pending invite cost a seat?",
  "Yes, until it expires.",
  "",
  "### When does the seat return?",
  "On the next invoice.",
  "",
  "### Can I remove the seat early?",
  "Yes, revoke the invite.",
].join("\n");

const scored = scoreRevisions(
  [
    { id: "rev-1", revisionNumber: 1, createdAt: new Date("2026-09-10T10:00:00.000Z"), content: thin },
    { id: "rev-2", revisionNumber: 2, createdAt: "2026-09-11T10:00:00.000Z", content: rich },
  ],
  { keyword: "seat billing" },
);

assert.equal(scored.length, 2);
assert.equal(scored[0].revision_number, 1);
assert.equal(scored[1].created_at, "2026-09-11T10:00:00.000Z");

// Every scored revision reports a percentage backed by the checks that applied to it.
for (const entry of scored) {
  assert.ok(entry.score >= 0 && entry.score <= 100, "score stays within 0-100");
  assert.ok(entry.total > 0, "at least one check applies");
  assert.equal(entry.passed <= entry.total, true);
  assert.equal(entry.score, Math.round((entry.passed / entry.total) * 100));
  assert.ok(entry.checks.length >= entry.total, "non-applicable checks are still reported");
}

// The structured revision must beat the thin one, otherwise the history plot is meaningless.
assert.ok(scored[1].score > scored[0].score, "structured content scores higher than a thin draft");

// Re-scoring the same snapshot is stable, which is what makes historic revisions comparable.
const rescored = scoreRevisions(
  [{ id: "rev-2", revisionNumber: 2, createdAt: "2026-09-11T10:00:00.000Z", content: rich }],
  { keyword: "seat billing" },
);
assert.deepEqual(rescored[0], scored[1]);

// Missing content is scored, not crashed on. Empty content still passes the checks that
// are vacuously true (no repeated headings), so the floor is low rather than zero.
const empty = scoreRevisions([{ id: "rev-0", revisionNumber: 0, createdAt: new Date(), content: "" }]);
assert.ok(empty[0].score >= 0 && empty[0].score < scored[1].score, "empty content scores below a real draft");
assert.equal(empty[0].checks.some((check) => check.ok === true && check.label === "H1 included"), false);

console.log("post-scorecard self-test passed");
