import { URL } from "url";

interface FeedItem {
  title: string;
  url: string;
  content?: string;
  summary?: string;
  pubDate?: string;
  score?: number;
  comments?: number;
  author?: string;
  platform?: string;
}

interface FetchOpts {
  sourceUrl: string;
  platform?: string;
  platformConfig?: any;
  filterType?: string;
  filterValue?: number;
  filterOldPostsDays?: number;
  includeContent?: boolean;
  includeSummary?: boolean;
  includeComments?: number;
  keywords?: string[];
  limit?: number;
}

// SSRF protection
function isPrivateIP(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  if (hostname.startsWith("10.") || hostname.startsWith("192.168.")) return true;
  if (hostname.startsWith("172.")) {
    const second = parseInt(hostname.split(".")[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return true;
  return false;
}

function validateUrl(urlStr: string): URL {
  const url = new URL(urlStr);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP/HTTPS URLs allowed");
  }
  if (isPrivateIP(url.hostname)) {
    throw new Error("Access to private/internal URLs is not allowed");
  }
  return url;
}

export async function fetchSocialContent(opts: FetchOpts): Promise<{ items: FeedItem[]; source: string; platform: string }> {
  const platform = opts.platform || "rss";
  const limit = opts.limit || 25;

  let items: FeedItem[] = [];

  switch (platform) {
    case "rss":
      items = await fetchRss(opts.sourceUrl, limit);
      break;
    case "youtube":
      items = await fetchYoutube(opts.sourceUrl, limit);
      break;
    case "reddit":
      items = await fetchReddit(opts.sourceUrl, opts.platformConfig, limit);
      break;
    case "hackernews":
      items = await fetchHackerNews(opts.platformConfig, limit);
      break;
    case "github":
      items = await fetchGithub(opts.platformConfig, limit);
      break;
    case "lemmy":
      items = await fetchLemmy(opts.sourceUrl, opts.platformConfig, limit);
      break;
    case "lobsters":
      items = await fetchLobsters(limit);
      break;
    default:
      items = await fetchRss(opts.sourceUrl, limit);
  }

  // Apply filters
  if (opts.filterType && opts.filterType !== "none" && opts.filterValue) {
    items = applyFilter(items, opts.filterType, opts.filterValue);
  }

  // Filter old posts
  if (opts.filterOldPostsDays) {
    const cutoff = new Date(Date.now() - opts.filterOldPostsDays * 24 * 60 * 60 * 1000);
    items = items.filter((item) => {
      if (!item.pubDate) return true;
      return new Date(item.pubDate) >= cutoff;
    });
  }

  // Keyword filter
  if (opts.keywords?.length) {
    const kws = opts.keywords.map((k) => k.toLowerCase());
    items = items.filter((item) => {
      const text = `${item.title} ${item.content || ""} ${item.summary || ""}`.toLowerCase();
      return kws.some((kw) => text.includes(kw));
    });
  }

  return { items: items.slice(0, limit), source: opts.sourceUrl, platform };
}

async function fetchRss(url: string, limit: number): Promise<FeedItem[]> {
  validateUrl(url);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch RSS: ${resp.status}`);
  const text = await resp.text();

  const items: FeedItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  const regex = text.includes("<entry>") ? entryRegex : itemRegex;

  let match;
  while ((match = regex.exec(text)) !== null && items.length < limit) {
    const xml = match[1];
    items.push({
      title: extractTag(xml, "title"),
      url: extractTag(xml, "link") || extractAttr(xml, "link", "href"),
      content: extractTag(xml, "content:encoded") || extractTag(xml, "content") || extractTag(xml, "description"),
      summary: extractTag(xml, "description") || extractTag(xml, "summary"),
      pubDate: extractTag(xml, "pubDate") || extractTag(xml, "published") || extractTag(xml, "updated"),
      author: extractTag(xml, "author") || extractTag(xml, "dc:creator"),
      platform: "rss",
    });
  }
  return items;
}

async function fetchYoutube(channelUrl: string, limit: number): Promise<FeedItem[]> {
  // Convert channel URL to RSS feed
  let feedUrl = channelUrl;
  if (channelUrl.includes("youtube.com")) {
    const channelMatch = channelUrl.match(/channel\/([^\/\?]+)/);
    const handleMatch = channelUrl.match(/@([^\/\?]+)/);
    if (channelMatch) {
      feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelMatch[1]}`;
    } else if (handleMatch) {
      feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${handleMatch[1]}`;
    }
  }
  const items = await fetchRss(feedUrl, limit);
  return items.map((i) => ({ ...i, platform: "youtube" }));
}

async function fetchReddit(subredditUrl: string, config: any, limit: number): Promise<FeedItem[]> {
  const sort = config?.sort || "hot";
  let url = subredditUrl;
  if (!url.endsWith(".json") && !url.endsWith("/")) url += "/";
  if (!url.endsWith(".json")) url += `${sort}.json?limit=${limit}`;

  try {
    const resp = await fetch(url, { headers: { "User-Agent": "BlogFactory/1.0" } });
    if (!resp.ok) throw new Error("Reddit fetch failed");
    const data = await resp.json() as any;

    return (data.data?.children || []).map((child: any) => ({
      title: child.data.title,
      url: `https://reddit.com${child.data.permalink}`,
      content: child.data.selftext || "",
      summary: child.data.selftext?.substring(0, 300),
      pubDate: new Date(child.data.created_utc * 1000).toISOString(),
      score: child.data.score,
      comments: child.data.num_comments,
      author: child.data.author,
      platform: "reddit",
    }));
  } catch {
    // Fallback to RSS
    const rssUrl = subredditUrl.replace(/\/?$/, "/.rss");
    return fetchRss(rssUrl, limit);
  }
}

async function fetchHackerNews(config: any, limit: number): Promise<FeedItem[]> {
  const hnType = config?.type || "front_page";
  const endpoint = hnType === "best" ? "beststories" : hnType === "new" ? "newstories" : "topstories";

  const resp = await fetch(`https://hacker-news.firebaseio.com/v0/${endpoint}.json`);
  const ids = (await resp.json() as number[]).slice(0, limit);

  const items = await Promise.all(
    ids.map(async (id) => {
      const itemResp = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      const item = await itemResp.json() as any;
      return {
        title: item.title || "",
        url: item.url || `https://news.ycombinator.com/item?id=${id}`,
        content: item.text || "",
        pubDate: new Date(item.time * 1000).toISOString(),
        score: item.score,
        comments: item.descendants,
        author: item.by,
        platform: "hackernews",
      } as FeedItem;
    })
  );

  return items;
}

async function fetchGithub(config: any, limit: number): Promise<FeedItem[]> {
  const language = config?.language || "";
  const period = config?.period || "daily";
  const since = period === "weekly" ? "weekly" : period === "monthly" ? "monthly" : "daily";

  const dateOffset = since === "weekly" ? 7 : since === "monthly" ? 30 : 1;
  const sinceDate = new Date(Date.now() - dateOffset * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  let query = `created:>${sinceDate}`;
  if (language) query += ` language:${language}`;

  const resp = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`, {
    headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "BlogFactory/1.0" },
  });

  const data = await resp.json() as any;
  return (data.items || []).map((repo: any) => ({
    title: `${repo.full_name}: ${repo.description || ""}`,
    url: repo.html_url,
    content: repo.description || "",
    summary: `★${repo.stargazers_count} | ${repo.language || "Unknown"} | ${repo.forks_count} forks`,
    score: repo.stargazers_count,
    author: repo.owner?.login,
    platform: "github",
  }));
}

async function fetchLemmy(instanceUrl: string, config: any, limit: number): Promise<FeedItem[]> {
  const community = config?.community || "";
  const sort = config?.sort || "Hot";

  let apiUrl = `${instanceUrl}/api/v3/post/list?sort=${sort}&limit=${limit}`;
  if (community) apiUrl += `&community_name=${community}`;

  const resp = await fetch(apiUrl);
  if (!resp.ok) throw new Error("Lemmy fetch failed");
  const data = await resp.json() as any;

  return (data.posts || []).map((p: any) => ({
    title: p.post.name,
    url: p.post.ap_id || p.post.url || "",
    content: p.post.body || "",
    pubDate: p.post.published,
    score: p.counts?.score,
    comments: p.counts?.comments,
    author: p.creator?.name,
    platform: "lemmy",
  }));
}

async function fetchLobsters(limit: number): Promise<FeedItem[]> {
  const resp = await fetch("https://lobste.rs/hottest.json");
  const data = await resp.json() as any[];

  return data.slice(0, limit).map((item) => ({
    title: item.title,
    url: item.url || item.short_id_url,
    content: item.description || "",
    pubDate: item.created_at,
    score: item.score,
    comments: item.comment_count,
    author: item.submitter_user?.username,
    platform: "lobsters",
  }));
}

function applyFilter(items: FeedItem[], filterType: string, filterValue: number): FeedItem[] {
  if (filterType === "score") {
    return items.filter((i) => (i.score || 0) >= filterValue);
  }
  if (filterType === "threshold") {
    const avgScore = items.reduce((sum, i) => sum + (i.score || 0), 0) / (items.length || 1);
    const threshold = avgScore * (filterValue / 100);
    return items.filter((i) => (i.score || 0) >= threshold);
  }
  if (filterType === "posts_per_day") {
    return items.slice(0, filterValue);
  }
  return items;
}

function extractTag(xml: string, tag: string): string {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i").exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();
  const match = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i").exec(xml);
  return match ? match[1].trim() : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const match = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i").exec(xml);
  return match ? match[1] : "";
}
