import assert from "node:assert/strict";
import { buildSerpBrief, groupQuestions, headingsFromHtml, median, serpProviderConfigured, wordCountFromHtml } from "./keyword-research.js";
import { computeGap, normalizeCompetitorDomain, parseSitemapXml, topicFromUrl } from "./competitor-gap.js";

// question tree grouping
const questions = groupQuestions([
  { text: "How to track hair growth", depth: 1 },
  { text: "how to track hair growth", depth: 2 },
  { text: "how to track hair growth at home", depth: 2 },
  { text: "can you track hair growth with an app", depth: 1 },
  { text: "what is the best pizza oven", depth: 1 },
  { text: "hair growth tracker app", depth: 1 },
], "hair growth");
assert.deepEqual(questions.map((item) => item.question), [
  "how to track hair growth", "can you track hair growth with an app", "how to track hair growth at home",
]);
assert.equal(questions[0].word, "how");
assert.equal(questions.some((item) => item.question.includes("pizza")), false, "off-topic questions are dropped");

const family = groupQuestions(Array.from({ length: 8 }, (_, i) => ({ text: `how long does it take hair growth with item${i}`, depth: 1 as const })), "hair growth");
assert.equal(family.length, 3, "one question family is capped");

// serp brief
const html = `<html><body><nav>Menu Menu</nav><h1>T</h1><h2>1. What is a hair tracker?</h2><p>${"word ".repeat(400)}</p><h3>Benefits of tracking</h3></body></html>`;
assert.deepEqual(headingsFromHtml(html), ["What is a hair tracker?", "Benefits of tracking"]);
assert.ok(wordCountFromHtml(html) >= 400 && wordCountFromHtml(html) < 420, "nav text is excluded");
assert.equal(median([1000, 3000, 2000]), 2000);
assert.equal(median([]), 0);

const brief = buildSerpBrief([
  { url: "a", title: "A", headings: ["What is a hair tracker?", "Best hair trackers", "Pricing"], words: 1800 },
  { url: "b", title: "B", headings: ["What is a hair tracker", "Best hair trackers 2026"], words: 2200 },
  { url: "c", title: "C", headings: ["Unrelated thing"], words: 100 },
], ["how to track hair growth", "can you track hair growth"]);
assert.equal(brief.sharedHeadings.length, 2);
assert.equal(brief.sharedHeadings[0].pages, 2);
assert.equal(brief.medianWords, 2000, "tiny pages are ignored for length");
assert.equal(brief.targetWords, 2200);
assert.equal(brief.suggestedOutline.at(-1), "FAQ");
assert.equal(buildSerpBrief([], []).targetWords, 1500);

delete process.env.BRAVE_SEARCH_API_KEY;
assert.equal(serpProviderConfigured(), false);

// competitor gap
assert.equal(normalizeCompetitorDomain("Hairmetric.com/"), "https://hairmetric.com");
assert.throws(() => normalizeCompetitorDomain("localhost"));
assert.throws(() => normalizeCompetitorDomain("192.168.1.5"));
assert.throws(() => normalizeCompetitorDomain(""));

const parsed = parseSitemapXml("<urlset><url><loc>https://x.com/blog/a-b</loc></url><url><loc><![CDATA[https://x.com/blog/c?x=1&amp;y=2]]></loc></url></urlset>");
assert.equal(parsed.isIndex, false);
assert.equal(parsed.locs.length, 2);
assert.equal(parseSitemapXml("<sitemapindex><sitemap><loc>https://x.com/s1.xml</loc></sitemap></sitemapindex>").isIndex, true);

assert.equal(topicFromUrl("https://x.com/blog/how-to-track-hair-growth"), "how to track hair growth");
assert.equal(topicFromUrl("https://x.com/blog/tag/hair"), null);
assert.equal(topicFromUrl("https://x.com/pricing"), null);
assert.equal(topicFromUrl("https://x.com/blog/post-2024"), null, "too short once the year is stripped");
assert.equal(topicFromUrl("https://x.com/hair-growth-tracker-vs-journal-guide"), "hair growth tracker vs journal guide");

const profile = { features: ["hair growth tracking"], problems: ["hair loss"], audience: [], seedTopics: ["hair growth tracker"], competitors: [] };
const result = computeGap([
  { url: "u1", topic: "how to track hair growth" },
  { url: "u2", topic: "how to track hair growth" },
  { url: "u3", topic: "best pizza ovens for home" },
  { url: "u4", topic: "hair loss tracking journal ideas" },
], ["How to Track Hair Growth With Photos", "Welcome"], profile);
assert.equal(result.covered, 1, "topic we already cover is not a gap");
assert.equal(result.gaps.length, 2);
assert.equal(result.gaps[0].topic, "hair loss tracking journal ideas", "product-fit topics rank first");
assert.equal(computeGap([{ url: "u", topic: "any topic here" }], [], null).gaps[0].fit, 0.5);

console.log("keyword-research self-test passed");
