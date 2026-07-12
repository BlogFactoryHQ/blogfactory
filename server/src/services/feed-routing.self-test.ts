import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";

const { mergeTopicTags, normalizeFeedEditorialDefaults, rssPublicationDate, sanitizeClassifiedTopics } = await import("./feed-routing.js");

assert.deepEqual(mergeTopicTags(["Teknoloji", "Yapay Zeka"], ["Yapay Zeka", "OpenAI"], 7), ["Teknoloji", "Yapay Zeka", "OpenAI"]);
assert.deepEqual(sanitizeClassifiedTopics(["yapay zeka", "Unknown", "Teknoloji", "OpenAI", "Extra"], ["Teknoloji", "Yapay Zeka", "OpenAI"]), ["Yapay Zeka", "Teknoloji", "OpenAI"]);
assert.equal(rssPublicationDate("Fri, 11 Jul 2026 10:00:00 GMT"), "2026-07-11");
assert.equal(rssPublicationDate("not-a-date"), "");
assert.equal(rssPublicationDate(undefined), "");
assert.deepEqual(normalizeFeedEditorialDefaults({ postType: "page", defaultTags: ["Tech", "Tech"] }, false).defaultTags, ["Tech"]);
assert.deepEqual(normalizeFeedEditorialDefaults({}, false), {
  profile: "generic",
  postType: "post",
  contentType: "",
  defaultTopicTags: [],
  defaultTags: [],
  defaultCategories: [],
  aiTopicsEnabled: true,
});
assert.equal(normalizeFeedEditorialDefaults({ contentType: "Analiz" }, true).contentType, "Analiz");

console.log("feed routing self-check passed");
