import assert from "node:assert/strict";
import {
  expandDraftVariations,
  fetchRssArticles,
  filterNewFeedArticles,
  hashContent,
  hydrateFeedArticlesWithFullText,
} from "./generation-sources.js";
import type { GenerateOpts } from "./generation-types.js";

const rss = `<?xml version="1.0"?>
<rss><channel>
  <item><title><![CDATA[Newest artificial intelligence story]]></title><link>https://example.com/new</link><description><![CDATA[<p>Useful AI details.</p>]]></description><category><![CDATA[World News]]></category><category>Politics</category><pubDate>Wed, 10 Jul 2026 10:00:00 GMT</pubDate></item>
  <item><title>Older unrelated story</title><link>https://example.com/old</link><description>Other details.</description><pubDate>Wed, 09 Jul 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;

const rssArticles = await fetchRssArticles(
  "https://example.com/feed.xml",
  5,
  undefined,
  ["artificial"],
  async () => new Response(rss),
);
assert.deepEqual(rssArticles, [{
  title: "Newest artificial intelligence story",
  content: "Useful AI details.",
  url: "https://example.com/new",
  pubDate: "Wed, 10 Jul 2026 10:00:00 GMT",
  tags: ["World News", "Politics"],
}]);

const generationOpts: GenerateOpts = { userId: "user-1", sourceType: "rss_feed", sourceValue: "https://example.com/feed.xml" };
const candidates = [
  { title: "Batch duplicate", content: "same" },
  { title: "Batch duplicate", content: "same" },
  { title: "Known URL", content: "url content", url: "https://example.com/known" },
  { title: "Known content", content: "stored content" },
  { title: "Fresh", content: "new content", url: "https://example.com/fresh" },
];
const knownContentHash = hashContent("Known contentstored content");
const filtered = await filterNewFeedArticles(candidates, generationOpts, 5, {
  contentHash: (article) => hashContent(article.title + article.content),
  sourceUrlExists: async (url) => url.endsWith("/known"),
  contentHashExists: async (contentHash) => contentHash === knownContentHash,
});
assert.deepEqual(filtered.articles.map((article) => article.title), ["Batch duplicate", "Fresh"]);
assert.deepEqual(filtered.skipped.map((article) => article.reason), [
  "Duplicate in fetched source batch",
  "Source URL already generated",
  "Already generated",
]);

const extractionErrors: string[] = [];
const hydrated = await hydrateFeedArticlesWithFullText([
  { title: "Short", content: "summary", url: "https://example.com/full" },
  { title: "Broken", content: "fallback", url: "https://example.com/broken" },
  { title: "Raw", content: "unchanged" },
], async (article) => {
  if (article.url?.endsWith("/broken")) throw new Error("extract failed");
  return { title: "Full title", content: "A much longer extracted article body." };
}, (article) => extractionErrors.push(article.url || ""));
assert.deepEqual(hydrated.map((article) => [article.title, article.content]), [
  ["Full title", "A much longer extracted article body."],
  ["Broken", "fallback"],
  ["Raw", "unchanged"],
]);
assert.deepEqual(extractionErrors, ["https://example.com/broken"]);

assert.deepEqual(
  expandDraftVariations([{ title: "URL", content: "Source" }], "url", 3).map((article) => article.variationIndex),
  [1, 2, 3],
);
assert.equal(expandDraftVariations([{ title: "Raw", content: "Source" }], "raw_text", 6).length, 5);
assert.equal(expandDraftVariations([{ title: "RSS", content: "Source" }], "rss_feed", 3).length, 1);

console.log("generation source preparation self-test ok");
