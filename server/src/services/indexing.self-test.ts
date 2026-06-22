import assert from "node:assert/strict";
import { isGoogleIndexingEligibleHtml, normalizeSubmittedUrls } from "./indexing.js";

assert.deepEqual(
  normalizeSubmittedUrls([
    "example.com/a#section",
    "https://www.example.com/a",
    "https://example.com/a#section",
  ], "example.com"),
  ["https://example.com/a", "https://www.example.com/a"],
);

assert.throws(() => normalizeSubmittedUrls(["https://other.com/a"], "example.com"), /does not belong/);
assert.equal(isGoogleIndexingEligibleHtml('<script type="application/ld+json">{"@type":"JobPosting"}</script>'), true);
assert.equal(isGoogleIndexingEligibleHtml('{"@type":"VideoObject","publication":{"@type":"BroadcastEvent"}}'), true);
assert.equal(isGoogleIndexingEligibleHtml('<article>{"@type":"Article"}</article>'), false);

console.log("indexing self-test ok");
