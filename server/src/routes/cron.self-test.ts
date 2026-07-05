import { isCronAuthorized, readCronDrainConfig } from "./cron.js";

process.env.CRON_SECRET = "secret";

console.assert(isCronAuthorized("Bearer secret"), "accepts matching bearer token");
console.assert(!isCronAuthorized("Bearer nope"), "rejects wrong bearer token");
console.assert(!isCronAuthorized(undefined), "rejects missing header");
console.assert(!isCronAuthorized("Bearer secret", ""), "rejects missing configured secret");

const defaultConfig = readCronDrainConfig(() => undefined, {
  RSS_CRON_MAX_FEEDS: "2",
  RSS_CRON_MAX_POSTS_PER_FEED: "3",
  GSC_CRON_MAX_SITES: "4",
});
console.assert(defaultConfig.feeds.maxFeeds === 2, "uses feed env limit");
console.assert(defaultConfig.feeds.maxPostsPerFeed === 3, "uses posts-per-feed env limit");
console.assert(defaultConfig.searchConsole.limit === 4, "uses search console env limit");

const queryConfig = readCronDrainConfig((name) => ({
  maxFeeds: "12",
  maxPostsPerFeed: "8",
  maxCampaigns: "2",
  maxItemsPerCampaign: "1",
  limit: "25",
}[name]), {});
console.assert(queryConfig.feeds.maxFeeds === 10, "caps feed limit");
console.assert(queryConfig.feeds.maxPostsPerFeed === 5, "caps posts-per-feed limit");
console.assert(queryConfig.campaigns.maxCampaigns === 2, "uses campaign query limit");
console.assert(queryConfig.campaigns.maxItemsPerCampaign === 1, "uses campaign item query limit");
console.assert(queryConfig.indexing.limit === 25, "uses generic limit for indexing");
console.assert(queryConfig.searchConsole.limit === 10, "caps generic limit for search console");

console.log("cron self-test ok");
