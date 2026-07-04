import assert from "node:assert/strict";
import { buildGithubSearchQuery, githubSinceDate, hackerNewsEndpoint } from "./fetch-social-content.js";

const now = new Date("2026-07-04T12:00:00Z");

assert.equal(githubSinceDate("daily", now), "2026-07-04");
assert.equal(githubSinceDate("weekly", now), "2026-06-29");
assert.equal(githubSinceDate("monthly", now), "2026-07-01");

assert.equal(
  buildGithubSearchQuery({ since: "monthly", language: "typescript", topic: "ai-agents" }, now),
  "created:>=2026-07-01 language:typescript topic:ai-agents"
);

assert.equal(
  buildGithubSearchQuery({ period: "weekly" }, now),
  "created:>=2026-06-29"
);

assert.equal(
  buildGithubSearchQuery({ since: "bad" }, now),
  "created:>=2026-07-04"
);

assert.equal(hackerNewsEndpoint("front_page"), "topstories");
assert.equal(hackerNewsEndpoint("best"), "beststories");
assert.equal(hackerNewsEndpoint("new"), "newstories");
assert.equal(hackerNewsEndpoint("ask"), "askstories");
assert.equal(hackerNewsEndpoint("show"), "showstories");

console.log("fetch-social-content self-test ok");
