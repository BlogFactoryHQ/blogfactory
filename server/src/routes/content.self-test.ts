import assert from "node:assert/strict";
import { fetchSocialSourceUrl } from "./content.js";

assert.equal(
  fetchSocialSourceUrl({
    platform: "youtube",
    config: { channelId: "UCsBjURrPoezykLs9EqgamOA" },
  }),
  "https://www.youtube.com/feeds/videos.xml?channel_id=UCsBjURrPoezykLs9EqgamOA"
);

assert.equal(
  fetchSocialSourceUrl({
    platform: "rss",
    config: { url: "https://example.com/feed.xml" },
  }),
  "https://example.com/feed.xml"
);

assert.equal(
  fetchSocialSourceUrl({
    platform: "reddit",
    config: { subreddit: "technology", redditDomain: "old.reddit.com" },
  }),
  "https://old.reddit.com/r/technology/"
);

assert.equal(
  fetchSocialSourceUrl({
    platform: "hackernews",
    config: { type: "best" },
  }),
  "https://news.ycombinator.com/"
);

assert.equal(
  fetchSocialSourceUrl({
    platform: "github",
    config: { since: "monthly" },
  }),
  "https://github.com/trending"
);

console.log("content route self-test ok");
