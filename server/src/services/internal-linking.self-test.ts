import assert from "node:assert/strict";
import {
  canRefreshInternalLinks,
  cosineSimilarity,
  extractMainText,
  nextInternalLinkRefreshAt,
  normalizeVector,
  rankPagesByEmbedding,
  sanitizeInternalLinkIndex,
} from "./internal-linking.js";

const text = extractMainText("<html><body><nav>Menu</nav><main><h1>Hello</h1><script>bad()</script><p>Useful text</p></main></body></html>");
assert.match(text, /Hello Useful text/);
assert.doesNotMatch(text, /bad/);

const vector = normalizeVector([3, 4]);
assert.ok(Math.abs(Math.sqrt(vector[0] ** 2 + vector[1] ** 2) - 1) < 0.000001);
assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
assert.deepEqual(
  rankPagesByEmbedding([
    { url: "/a", embedding: [1, 0] },
    { url: "/b", embedding: [0, 1] },
  ], [0.9, 0.1]).map((page) => page.url),
  ["/a", "/b"],
);

const now = new Date("2026-06-22T00:00:00Z");
assert.equal(canRefreshInternalLinks("2026-06-09T00:00:00Z", now), false);
assert.equal(canRefreshInternalLinks("2026-06-08T00:00:00Z", now), true);
assert.equal(nextInternalLinkRefreshAt("2026-06-09T00:00:00Z")?.toISOString(), "2026-06-23T00:00:00.000Z");

assert.deepEqual(
  sanitizeInternalLinkIndex({ pages: [{ title: "A", embedding: [1], text: "secret" }] }),
  { pages: [{ title: "A" }] },
);

console.log("internal-linking self-test ok");
