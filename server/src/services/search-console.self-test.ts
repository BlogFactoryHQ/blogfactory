import assert from "node:assert/strict";
import { createSearchConsoleOAuthUrl, mapSearchAnalyticsRows, normalizeSearchConsoleProperty } from "./search-console.js";

assert.equal(normalizeSearchConsoleProperty("sc-domain:WWW.Example.com"), "sc-domain:example.com");
assert.equal(normalizeSearchConsoleProperty("example.com"), "https://example.com/");
assert.equal(normalizeSearchConsoleProperty("https://example.com/blog?x=1#top"), "https://example.com/blog");
assert.throws(() => normalizeSearchConsoleProperty(""), /required/);

assert.deepEqual(mapSearchAnalyticsRows([
  { keys: ["2026-06-01", "https://example.com/a", "crm"], clicks: 1.4, impressions: 10.2, ctr: 0.1, position: 12.5 },
  { keys: ["missing"], clicks: 9 },
]), [
  { date: "2026-06-01", pageUrl: "https://example.com/a", query: "crm", clicks: 1, impressions: 10, ctr: 0.1, position: 12.5 },
]);

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
