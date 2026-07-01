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

console.log("content route self-test ok");
