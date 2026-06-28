import assert from "node:assert/strict";
import { classifyOptimizeStatus, fallbackSuggestions, normalizePageUrlForSite } from "./optimize.js";

assert.equal(classifyOptimizeStatus({
  baseline: { clicks: 100, impressions: 500, position: 4 },
  latest: { clicks: 70, impressions: 450, position: 4.5 },
}), "needs_attention");

assert.equal(classifyOptimizeStatus({
  baseline: { clicks: 20, impressions: 200, position: 12 },
  latest: { clicks: 25, impressions: 220, position: 12.5 },
}), "tracking");

assert.equal(classifyOptimizeStatus({
  baseline: { clicks: 100, impressions: 500, position: 8 },
  latest: { clicks: 130, impressions: 500, position: 4.5 },
  optimizedAt: "2026-06-01T00:00:00Z",
}), "improved");

assert.equal(normalizePageUrlForSite("https://www.example.com/post#top", "example.com"), "https://www.example.com/post");
assert.throws(() => normalizePageUrlForSite("https://other.com/post", "example.com"), /does not belong/);

const suggestions = fallbackSuggestions(
  { url: "https://example.com/a", wordCount: 300, sectionCount: 2, features: { faq: false, table: false, video: false, tableOfContents: false, images: 0 } },
  [{ url: "https://competitor.com/a", wordCount: 1000, sectionCount: 5, features: { faq: true, table: true, video: false, tableOfContents: true, images: 2 } }],
);
assert.equal(suggestions[0].impact, "high");
assert.match(suggestions.map((item) => item.title).join("\n"), /FAQ/);

console.log("optimize self-test ok");
