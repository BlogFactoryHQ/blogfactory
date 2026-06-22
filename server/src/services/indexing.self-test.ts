import assert from "node:assert/strict";
import { isGoogleIndexingEligibleHtml, normalizeSubmittedUrls } from "./indexing.js";

assert.deepEqual(
  normalizeSubmittedUrls([
    "https://www.example.com/a",
    "https://example.com/a#section",
  ], "https://example.com"),
  ["https://www.example.com/a", "https://example.com/a"],
);

assert.throws(() => normalizeSubmittedUrls(["example.com/a"], "example.com"), /Invalid URL/);
assert.throws(() => normalizeSubmittedUrls(["https://other.com/a"], "example.com"), /does not belong/);
assert.equal(isGoogleIndexingEligibleHtml('<script type="application/ld+json">{"@type":"JobPosting"}</script>'), true);
assert.equal(isGoogleIndexingEligibleHtml('{"@type":"VideoObject","publication":{"@type":"BroadcastEvent"}}'), true);
assert.equal(isGoogleIndexingEligibleHtml('{"@graph":[{"@type":"VideoObject"},{"@type":"BroadcastEvent"}]}'), false);
assert.equal(isGoogleIndexingEligibleHtml('<article>{"@type":"Article"}</article>'), false);

console.log("indexing self-test ok");
