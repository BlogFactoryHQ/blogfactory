import { getObject } from "./s3-client.js";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY;
const URL_FETCH_TIMEOUT_MS = 15_000;
const AI_EXTRACT_TIMEOUT_MS = 35_000;

export interface ExtractOpts {
  userId: string;
  sourceType: string;
  sourceValue: string;
  extractModel?: string;
}

export async function extractContent(opts: ExtractOpts): Promise<{ content: string; title?: string; metadata?: any }> {
  switch (opts.sourceType) {
    case "youtube":
      return extractYoutube(opts.sourceValue);
    case "pdf":
      return extractPdf(opts.sourceValue, opts.userId);
    case "url":
      return extractUrl(opts.sourceValue, opts.extractModel);
    default:
      return { content: opts.sourceValue };
  }
}

function extractYoutubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\?\/\s]+)/,
    /youtube\.com\/shorts\/([^&\?\/\s]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

async function extractYoutube(url: string): Promise<{ content: string; title?: string; metadata?: any }> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new Error("Invalid YouTube URL");

  // Fetch the video page to extract captions
  const pageResp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
  });
  const html = await pageResp.text();

  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(" - YouTube", "").trim() : undefined;

  // Try to extract captions URL from the page
  const captionsMatch = html.match(/"captionTracks":\[{"baseUrl":"([^"]+)"/);
  if (captionsMatch) {
    const captionsUrl = captionsMatch[1].replace(/\\u0026/g, "&");
    const capsResp = await fetch(captionsUrl, { signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS) });
    const capsXml = await capsResp.text();

    // Parse caption XML
    const textRegex = /<text[^>]*>([^<]*)<\/text>/g;
    const segments: string[] = [];
    let match;
    while ((match = textRegex.exec(capsXml)) !== null) {
      segments.push(match[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
    }

    return {
      content: segments.join(" "),
      title,
      metadata: { videoId, type: "youtube", hasCaptions: true },
    };
  }

  return {
    content: `YouTube video: ${url}\nTitle: ${title || "Unknown"}\n\nNote: Captions not available for extraction.`,
    title,
    metadata: { videoId, type: "youtube", hasCaptions: false },
  };
}

async function extractPdf(storagePath: string, userId: string): Promise<{ content: string; title?: string; metadata?: any }> {
  const { body: pdfBuffer } = await getObject(storagePath);
  const base64 = pdfBuffer.toString("base64");

  // Use Google Gemini for PDF text extraction
  if (GOOGLE_AI_KEY) {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_AI_KEY}`,
      {
        method: "POST",
        signal: AbortSignal.timeout(AI_EXTRACT_TIMEOUT_MS),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: "application/pdf", data: base64 } },
              { text: "Extract all text content from this PDF document. Preserve the structure including headers, paragraphs, and lists. Output in markdown format." },
            ],
          }],
        }),
      }
    );

    if (resp.ok) {
      const data = await resp.json() as any;
      const extractedText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const titleMatch = extractedText.match(/^#\s+(.+)/m);
      return {
        content: extractedText,
        title: titleMatch ? titleMatch[1] : undefined,
        metadata: { type: "pdf", method: "gemini" },
      };
    }
  }

  // Fallback: Use OpenRouter
  if (OPENROUTER_API_KEY) {
    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(AI_EXTRACT_TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Extract all text content from this PDF. Preserve structure. Output in markdown." },
            { type: "file", file: { filename: "document.pdf", file_data: `data:application/pdf;base64,${base64}` } },
          ],
        }],
        plugins: [{ id: "file-parser", pdf: { engine: "cloudflare-ai" } }],
      }),
    });

    if (resp.ok) {
      const data = await resp.json() as any;
      const text = data.choices?.[0]?.message?.content || "";
      return { content: text, metadata: { type: "pdf", method: "openrouter" } };
    }
  }

  throw new Error("No AI provider available for PDF extraction");
}

async function extractUrl(url: string, model?: string): Promise<{ content: string; title?: string; metadata?: any }> {
  let resp: Response;
  try {
    resp = await fetch(url, {
      signal: AbortSignal.timeout(URL_FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BlogFactory/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (err: any) {
    if (err?.name === "AbortError" || err?.name === "TimeoutError") {
      throw new Error("Source URL timed out while fetching content. Try a shorter source or paste the article text directly.");
    }
    throw err;
  }

  if (!resp.ok) throw new Error(`Failed to fetch URL: ${resp.status}`);
  const html = await resp.text();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // Try to extract main content
  const content = extractMainContent(html);

  if (content.length > 200) {
    return { content, title, metadata: { type: "url", method: "html-extraction" } };
  }

  // Fallback to AI extraction if content is too short
  if (OPENROUTER_API_KEY) {
    try {
      const aiResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        signal: AbortSignal.timeout(AI_EXTRACT_TIMEOUT_MS),
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: model || "google/gemini-2.5-flash",
          messages: [{
            role: "user",
            content: `Extract the main article content from this webpage HTML. Return clean text in markdown format:\n\n${html.substring(0, 15000)}`,
          }],
          max_completion_tokens: 4096,
        }),
      });

      if (aiResp.ok) {
        const aiData = await aiResp.json() as any;
        const aiContent = aiData.choices?.[0]?.message?.content || content;
        return { content: aiContent, title, metadata: { type: "url", method: "ai-extraction" } };
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || err?.name === "TimeoutError") {
        throw new Error("Source URL extraction timed out. Try pasting the article text directly.");
      }
      throw err;
    }
  }

  return { content, title, metadata: { type: "url", method: "html-extraction" } };
}

function extractMainContent(html: string): string {
  // Remove script, style, nav, header, footer tags
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, "")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
    .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, "");

  // Try to find article or main content area
  const articleMatch = cleaned.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = cleaned.match(/<main[^>]*>([\s\S]*?)<\/main>/i);

  const contentHtml = articleMatch?.[1] || mainMatch?.[1] || cleaned;

  // Strip remaining HTML tags
  return contentHtml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
