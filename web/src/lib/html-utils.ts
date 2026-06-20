/**
 * Decode HTML entities in a string, handling double-encoding
 * (e.g., &amp;lt;p&amp;gt; → <p>, &lt;p&gt; → <p>)
 */
export function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  // Run decode twice to handle double-encoded entities (common in RSS/Atom feeds)
  let result = text;
  for (let i = 0; i < 2; i++) {
    result = result
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
  }
  return result;
}

/**
 * Strip HTML tags from a string and return plain text
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  const decoded = decodeHtmlEntities(html);
  return decoded
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Estimate word count from text
 */
export function wordCount(text: string): number {
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Check if HTML content contains media elements
 */
export function detectMedia(html: string): { hasImages: boolean; hasVideo: boolean } {
  if (!html) return { hasImages: false, hasVideo: false };
  const decoded = decodeHtmlEntities(html);
  return {
    hasImages: /<img\s/i.test(decoded) || /\.(jpg|jpeg|png|gif|webp|svg)/i.test(decoded),
    hasVideo: /<video\s/i.test(decoded) || /<iframe\s/i.test(decoded) || /youtube\.com|vimeo\.com/i.test(decoded),
  };
}
