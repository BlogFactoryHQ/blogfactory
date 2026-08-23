import assert from "node:assert/strict";
import {
  buildSearchConsoleInsights,
  buildCanonicalSearchPerformance,
  chunkSearchConsoleMetrics,
  chooseSearchConsoleProperty,
  createSearchConsoleOAuthUrl,
  mapSearchAnalyticsRows,
  normalizeAnalyticsInput,
  normalizeInspectionResult,
  normalizeInspectionUrl,
  normalizeSearchConsoleProperty,
} from "./search-console.js";

assert.equal(normalizeSearchConsoleProperty("sc-domain:WWW.Example.com"), "sc-domain:example.com");
assert.equal(normalizeSearchConsoleProperty("example.com"), "https://example.com/");
assert.equal(normalizeSearchConsoleProperty("https://example.com/blog?x=1#top"), "https://example.com/blog");
assert.throws(() => normalizeSearchConsoleProperty(""), /required/);
assert.equal(normalizeInspectionUrl("https://blog.example.com/post#top", "sc-domain:example.com"), "https://blog.example.com/post");
assert.throws(() => normalizeInspectionUrl("https://evil.test/post", "sc-domain:example.com"), /outside/);
assert.throws(() => normalizeInspectionUrl("https://example.com/other", "https://example.com/blog/"), /outside/);
assert.deepEqual(normalizeInspectionResult({
  indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed", googleCanonical: "https://example.com/post" },
  richResultsResult: { verdict: "PASS", detectedItems: [{ richResultType: "Article" }] },
}), {
  verdict: "PASS",
  coverageState: "Submitted and indexed",
  robotsTxtState: null,
  indexingState: null,
  pageFetchState: null,
  lastCrawlTime: null,
  crawledAs: null,
  googleCanonical: "https://example.com/post",
  userCanonical: null,
  referringUrls: [],
  sitemaps: [],
  richResultsVerdict: "PASS",
  richResultItems: [{ richResultType: "Article" }],
  inspectionResultLink: null,
});

const properties = [
  { siteUrl: "https://other.example/", permissionLevel: "siteOwner" },
  { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
];
assert.equal(chooseSearchConsoleProperty(properties, "www.example.com").property.siteUrl, "sc-domain:example.com");
assert.equal(chooseSearchConsoleProperty(properties, "https://www.example.com/blog").property.siteUrl, "sc-domain:example.com");
assert.equal(chooseSearchConsoleProperty(properties, "missing.example").requiresSelection, true);
assert.throws(() => chooseSearchConsoleProperty(properties, "example.com", "sc-domain:nope.example"), /cannot access/);
assert.deepEqual(normalizeAnalyticsInput({ range: 28, compare: true, groupBy: "query", searchType: "web", country: "TUR", device: "MOBILE", limit: 999 }), {
  range: 28,
  compare: true,
  groupBy: "query",
  searchType: "web",
  country: "tur",
  device: "MOBILE",
  includePreliminary: false,
  limit: 250,
});
assert.throws(() => normalizeAnalyticsInput({ range: 12 as 28, compare: true, groupBy: "query", searchType: "web", limit: 20 }), /range/);

assert.deepEqual(mapSearchAnalyticsRows([
  { keys: ["2026-06-01", "https://example.com/a", "crm"], clicks: 1.4, impressions: 10.2, ctr: 0.1, position: 12.5 },
  { keys: ["missing"], clicks: 9 },
]), [
  { date: "2026-06-01", pageUrl: "https://example.com/a", query: "crm", clicks: 1, impressions: 10, ctr: 0.1, position: 12.5 },
]);
assert.deepEqual(chunkSearchConsoleMetrics(Array.from({ length: 2501 }, (_, index) => ({
  date: "2026-06-01",
  pageUrl: `https://example.com/${index}`,
  query: "query",
  clicks: 1,
  impressions: 1,
  ctr: 1,
  position: 1,
}))).map((batch) => batch.length), [1000, 1000, 501]);

const emptyInsights = buildSearchConsoleInsights({ metrics: [] });
assert.equal(emptyInsights.totals.clicks.value, 0);
assert.equal(emptyInsights.daily.length, 0);

const canonical = buildCanonicalSearchPerformance([
  { keys: ["2026-05-10"], clicks: 60, impressions: 1500, ctr: 0.04, position: 12 },
  { keys: ["2026-06-14"], clicks: 75, impressions: 3300, ctr: 75 / 3300, position: 15.27 },
  { keys: ["2026-06-15"], clicks: 3, impressions: 100, ctr: 0.03, position: 14 },
], { first_incomplete_date: "2026-06-15" }, {
  range: 28, compare: true, searchType: "web", includePreliminary: false,
}, "2026-06-16", "sc-domain:example.com");
assert.deepEqual(canonical.range, { startDate: "2026-05-18", endDate: "2026-06-14", baselineStart: "2026-04-20", baselineEnd: "2026-05-17" });
assert.equal(canonical.totals.clicks.value, 75);
assert.equal(canonical.totals.clicks.baseline, 60);
assert.equal(canonical.provenance.complete_through, "2026-06-14");
const preliminary = buildCanonicalSearchPerformance([
  { keys: ["2026-06-15"], clicks: 3, impressions: 100, ctr: 0.03, position: 14 },
], { first_incomplete_date: "2026-06-15" }, {
  range: 28, compare: false, searchType: "web", includePreliminary: true,
}, "2026-06-16", "sc-domain:example.com");
assert.equal(preliminary.range.endDate, "2026-06-16");
assert.equal(preliminary.totals.clicks.value, 3);
assert.equal(preliminary.provenance.data_status, "preliminary");

const insights = buildSearchConsoleInsights({
  performance: canonical,
  metrics: [
    { date: "2026-05-10", pageUrl: "https://example.com/risk", query: "risk query", clicks: 50, impressions: 500, ctr: 0.1, position: 4 },
    { date: "2026-06-14", pageUrl: "https://example.com/risk", query: "risk query", clicks: 20, impressions: 500, ctr: 0.04, position: 8 },
    { date: "2026-05-10", pageUrl: "https://example.com/gain", query: "gain query", clicks: 10, impressions: 1000, ctr: 0.01, position: 20 },
    { date: "2026-06-14", pageUrl: "https://example.com/gain", query: "gain query", clicks: 20, impressions: 1000, ctr: 0.02, position: 20 },
    { date: "2026-06-14", pageUrl: "https://example.com/ctr", query: "ctr query", clicks: 5, impressions: 1000, ctr: 0.005, position: 20 },
    { date: "2026-06-14", pageUrl: "https://example.com/lift", query: "lift query", clicks: 30, impressions: 800, ctr: 0.0375, position: 8 },
  ],
});
assert.equal(insights.range.latestStart, "2026-05-18");
assert.equal(insights.range.baselineStart, "2026-04-20");
assert.equal(insights.totals.clicks.value, 75);
assert.equal(insights.totals.clicks.delta, 15);
assert.equal(insights.totals.ctr.value, 0.0227);
assert.equal(insights.totals.position.value, 15.27);
assert.equal(insights.opportunity_scope.scope, "page_query_rows");
assert.equal(insights.segments.needsAttention, 1);
assert.equal(insights.segments.ctrOpportunities, 1);
assert.equal(insights.segments.strikingDistance, 1);
assert.equal(insights.segments.improved, 1);
assert.equal(insights.actionRows.protectTraffic[0].query, "risk query");
assert.equal(insights.actionRows.liftCtr[0].query, "ctr query");
assert.equal(insights.actionRows.strikingDistance[0].query, "lift query");
assert.equal(insights.topQueries.find((row) => row.label === "ctr query")?.kind, "ctr");
assert.equal(insights.topQueries.find((row) => row.label === "risk query")?.kind, "risk");

process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_ID = "client-id";
process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET = "client-secret";
const oauthUrl = new URL(await createSearchConsoleOAuthUrl({
  userId: "user-1",
  siteId: "site-1",
  propertyUrl: "example.com",
  requestUrl: "https://app.example.com/api/search-console/oauth/start",
}));
assert.equal(oauthUrl.origin, "https://accounts.google.com");
assert.equal(oauthUrl.searchParams.get("client_id"), "client-id");
assert.equal(oauthUrl.searchParams.get("redirect_uri"), "https://app.example.com/api/search-console/oauth/callback");
assert.equal(oauthUrl.searchParams.get("scope"), "https://www.googleapis.com/auth/webmasters.readonly");
assert.ok(oauthUrl.searchParams.get("state"));

console.log("search-console self-test ok");
