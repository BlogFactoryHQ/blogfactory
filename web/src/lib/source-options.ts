export type SourcePlatform = "rss" | "youtube" | "reddit" | "hackernews" | "github";

export const FREQUENCIES = [
  { id: "hourly", name: "Hourly" },
  { id: "every_4_hours", name: "Every 4 hours" },
  { id: "every_12_hours", name: "Every 12 hours" },
  { id: "daily", name: "Daily" },
  { id: "weekly", name: "Weekly" },
];

export const PLATFORMS: Array<{ id: SourcePlatform; name: string; description: string }> = [
  { id: "rss", name: "RSS Feed", description: "Standard RSS/Atom feed" },
  { id: "youtube", name: "YouTube Channel", description: "Monitor channel for new videos" },
  { id: "reddit", name: "Reddit", description: "Subreddit posts with score filtering" },
  { id: "hackernews", name: "Hacker News", description: "Tech news from Y Combinator" },
  { id: "github", name: "GitHub Trending", description: "Trending repositories by language" },
];

export const FILTER_TYPES = [
  { id: "none", name: "No Filter", description: "Include all posts" },
  { id: "score", name: "Minimum Score", description: "Filter by minimum upvote score" },
  { id: "threshold", name: "Score Threshold %", description: "Filter by percentage of average score" },
  { id: "posts_per_day", name: "Posts Per Run", description: "Limit how many fetched items continue" },
];

export const HN_TYPES = [
  { id: "front_page", name: "Front Page" },
  { id: "best", name: "Best" },
  { id: "new", name: "New" },
  { id: "ask", name: "Ask HN" },
  { id: "show", name: "Show HN" },
];

export const GITHUB_PERIODS = [
  { id: "daily", name: "Today" },
  { id: "weekly", name: "This Week" },
  { id: "monthly", name: "This Month" },
];

export function sourceTypeForPlatform(platform?: string) {
  if (platform === "reddit" || platform === "hackernews" || platform === "github") return platform;
  return "rss_feed";
}

export function platformLabel(platform?: string) {
  return PLATFORMS.find((item) => item.id === platform)?.name || "RSS Feed";
}
