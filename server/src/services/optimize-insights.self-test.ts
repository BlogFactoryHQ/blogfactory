import assert from "node:assert/strict";
import { buildPageInsightsFromMetrics, internalLinkTargets } from "./optimize.js";

const baseline = "2026-06-10";
const latest = "2026-06-26";
const metric = (pageUrl: string, query: string, date: string, clicks: number, impressions: number, position: number) => ({
  pageUrl,
  query,
  date,
  clicks,
  impressions,
  position,
});

const rows = [
  metric("https://site.com/decline", "declining query", baseline, 100, 200, 4),
  metric("https://site.com/decline", "declining query", latest, 70, 200, 10),
  metric("https://site.com/growing", "growing query", baseline, 10, 100, 12),
  metric("https://site.com/growing", "growing query", latest, 20, 100, 8),
  metric("https://site.com/low-ctr", "money query", latest, 1, 200, 2),
  metric("https://site.com/page-two", "almost query", latest, 3, 100, 15),
  metric("https://site.com/zero", "visible query", latest, 0, 60, 30),
  metric("https://site.com/weighted", "a", latest, 10, 100, 10),
  metric("https://site.com/weighted", "b", latest, 10, 100, 20),
  metric("https://site.com/right", "same query", latest, 10, 100, 5),
  metric("https://site.com/wrong", "same query", latest, 0, 100, 20),
  ...Array.from({ length: 8 }, (_, index) => metric("https://site.com/focus", `topic ${index}`, latest, 1, 20, 8)),
];

const insights = buildPageInsightsFromMetrics(rows);
const byUrl = new Map(insights.map((item) => [item.pageUrl, item]));

assert.equal(byUrl.get("https://site.com/weighted")?.position, 15);
assert.equal(byUrl.get("https://site.com/weighted")?.ctr, 0.1);
assert.ok(byUrl.get("https://site.com/decline")?.opportunities.includes("needs_attention"));
assert.ok(byUrl.get("https://site.com/growing")?.opportunities.includes("growing"));
assert.ok(byUrl.get("https://site.com/low-ctr")?.opportunities.includes("low_ctr"));
assert.ok(byUrl.get("https://site.com/page-two")?.opportunities.includes("almost_ranking"));
assert.ok(byUrl.get("https://site.com/page-two")?.opportunities.includes("page_two"));
assert.ok(byUrl.get("https://site.com/zero")?.opportunities.includes("zero_clicks"));
assert.ok(byUrl.get("https://site.com/focus")?.opportunities.includes("weak_focus"));
assert.ok(byUrl.get("https://site.com/wrong")?.opportunities.includes("wrong_page_risk"));

const targets = internalLinkTargets({
  pages: [
    { title: "Topic guide", url: "https://site.com/topic-guide" },
    { title: "Current page", url: "https://site.com/current" },
  ],
}, "https://site.com/current");
assert.deepEqual(targets, [{ title: "Topic guide", url: "https://site.com/topic-guide" }]);

console.log("optimize insights self-test ok");
