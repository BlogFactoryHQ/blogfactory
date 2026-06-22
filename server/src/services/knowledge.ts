export interface KnowledgeChunk {
  id: string;
  text: string;
}

export interface KnowledgeDocument {
  title?: string;
  content?: string;
  status?: "processing" | "ready" | "failed";
  chunks?: KnowledgeChunk[];
}

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "how", "in", "into", "is", "it", "of", "on", "or", "our", "that", "the", "their", "this", "to", "with", "your",
]);

export function tokenizeKnowledge(value: string) {
  return new Set(
    (value.toLowerCase().match(/[a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi) || [])
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );
}

function splitLongSection(section: string, maxChars: number) {
  const pieces: string[] = [];
  let remaining = section.trim();
  while (remaining.length > maxChars) {
    const boundary = remaining.lastIndexOf(" ", maxChars);
    const cut = boundary > maxChars * 0.6 ? boundary : maxChars;
    pieces.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }
  if (remaining) pieces.push(remaining);
  return pieces;
}

export function chunkKnowledgeContent(content: string, maxChars = 1200) {
  const sections = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}|(?=^#{1,6}\s+)/m)
    .map((section) => section.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .flatMap((section) => splitLongSection(section, maxChars));

  const chunks: KnowledgeChunk[] = [];
  let current = "";

  for (const section of sections) {
    if (!current) {
      current = section;
    } else if (`${current}\n\n${section}`.length <= maxChars) {
      current = `${current}\n\n${section}`;
    } else {
      chunks.push({ id: `chunk-${chunks.length + 1}`, text: current });
      current = section;
    }
  }

  if (current) chunks.push({ id: `chunk-${chunks.length + 1}`, text: current });
  return chunks;
}

export function retrieveKnowledgeChunks(value: unknown, query: string, maxChunks = 6) {
  if (!Array.isArray(value)) return [];
  const queryTokens = tokenizeKnowledge(query);

  return value
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const document = item as KnowledgeDocument;
      if (document.status && document.status !== "ready") return [];

      const title = typeof document.title === "string" && document.title.trim() ? document.title.trim() : "Knowledge document";
      const chunks = Array.isArray(document.chunks) && document.chunks.length
        ? document.chunks
        : typeof document.content === "string" ? chunkKnowledgeContent(document.content) : [];

      return chunks
        .filter((chunk) => typeof chunk.text === "string" && chunk.text.trim())
        .map((chunk) => {
          const haystack = `${title} ${chunk.text}`;
          const tokens = tokenizeKnowledge(haystack);
          let score = 0;
          for (const token of tokens) {
            if (queryTokens.has(token)) score += token.length > 4 ? 2 : 1;
          }
          return { title, text: chunk.text.trim(), score };
        });
    })
    .filter((chunk) => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxChunks)
    .map((chunk) => `${chunk.title}: ${chunk.text}`);
}
