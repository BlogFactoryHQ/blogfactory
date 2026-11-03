/**
 * Visible names for a post's or run's `source_type`. Backend values stay as they are; the
 * console shows the operator's words (content rules: acronyms stay acronyms, sentence case).
 */
const SOURCE_LABELS: Record<string, string> = {
  rss: "RSS",
  rss_feed: "RSS",
  url: "URL",
  pdf: "PDF",
  file: "File",
  paste: "Text",
  raw_text: "Text",
  youtube: "YouTube",
  reddit: "Reddit",
  hackernews: "Hacker News",
  github: "GitHub",
  brief: "Brief",
  campaign: "Campaign",
  programmatic: "Programmatic",
  article_keyword: "Keyword",
  article_title: "Title",
  batch_import: "Batch import",
  mcp_batch_import: "MCP batch import",
  mcp: "MCP",
  manual_image_prompts: "Image prompts",
  seo_metadata: "SEO metadata",
};

export function formatSourceType(sourceType: string | null | undefined): string {
  if (!sourceType) return "—";
  const known = SOURCE_LABELS[sourceType.toLowerCase()];
  if (known) return known;
  const words = sourceType.replace(/[_-]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
