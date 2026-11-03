export type SourcePlatform = "rss" | "youtube" | "reddit" | "hackernews" | "github";

export const FREQUENCIES = [
  { id: "hourly", name: "Hourly" },
  { id: "every_4_hours", name: "Every 4 hours" },
  { id: "every_12_hours", name: "Every 12 hours" },
  { id: "daily", name: "Daily" },
  { id: "weekly", name: "Weekly" },
];

export const PLATFORMS: Array<{ id: SourcePlatform; name: string; description: string }> = [
  { id: "rss", name: "RSS feed", description: "Standard RSS/Atom feed" },
  { id: "youtube", name: "YouTube channel", description: "Monitor channel for new videos" },
  { id: "reddit", name: "Reddit", description: "Subreddit posts with score filtering" },
  { id: "hackernews", name: "Hacker News", description: "Tech news from Y Combinator" },
  { id: "github", name: "GitHub trending", description: "Trending repositories by language" },
];

export const FILTER_TYPES = [
  { id: "none", name: "No filter", description: "Include all posts" },
  { id: "score", name: "Minimum score", description: "Filter by minimum upvote score" },
  { id: "threshold", name: "Score threshold %", description: "Filter by percentage of average score" },
  { id: "posts_per_day", name: "Posts per run", description: "Limit how many fetched items continue" },
];

export const HN_TYPES = [
  { id: "front_page", name: "Front page" },
  { id: "best", name: "Best" },
  { id: "new", name: "New" },
  { id: "ask", name: "Ask HN" },
  { id: "show", name: "Show HN" },
];

export const GITHUB_PERIODS = [
  { id: "daily", name: "Today" },
  { id: "weekly", name: "This week" },
  { id: "monthly", name: "This month" },
];

export function sourceTypeForPlatform(platform?: string) {
  if (platform === "reddit" || platform === "hackernews" || platform === "github") return platform;
  return "rss_feed";
}

export function platformLabel(platform?: string) {
  return PLATFORMS.find((item) => item.id === platform)?.name || "RSS Feed";
}

export function filterTypesForPlatform(platform?: string, currentFilterType?: string) {
  const supportsScoreFilters = platform === "reddit" || platform === "hackernews" || platform === "github";
  const visible = FILTER_TYPES.filter((item) => {
    if (item.id === "posts_per_day") return item.id === currentFilterType;
    return item.id === "none" || supportsScoreFilters;
  });
  if (currentFilterType && !visible.some((item) => item.id === currentFilterType)) {
    const current = FILTER_TYPES.find((item) => item.id === currentFilterType);
    if (current) return [...visible, current];
  }
  return visible;
}
