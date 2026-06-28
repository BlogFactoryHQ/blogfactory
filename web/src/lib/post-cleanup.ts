import { api } from "@/lib/api";

const AI_META_NOTE_PATTERNS = [
  /^\(?\s*toplam\s+kelime\s+sayısı.*\)?$/iu,
  /^\(?\s*(?:yukarıdaki\s+)?bağlantılar\b.*\b(?:iç\s+link|yerleştirilmiş|doğal\s+bağlam)\b.*\)?$/iu,
  /^\(?\s*(?:the\s+)?total\s+word\s+count\b.*\)?$/iu,
  /^\(?\s*internal\s+links?\b.*\b(?:placed|inserted|included)\b.*\)?$/iu,
];

function isAiMetaNote(line: string) {
  const text = line.trim();
  return AI_META_NOTE_PATTERNS.some((pattern) => pattern.test(text));
}

export function cleanGeneratedPostContent(content: string) {
  const lines = content.split(/\r?\n/);
  while (lines.at(-1)?.trim() === "") lines.pop();
  while (lines.length && isAiMetaNote(lines.at(-1) || "")) {
    lines.pop();
    while (lines.at(-1)?.trim() === "") lines.pop();
  }
  return lines.join("\n").trim();
}

export function cleanPostTitle(title: string) {
  return title
    .replace(/\\\|/g, "|")
    .replace(/\s+\(Draft\s+\d+\)$/i, "")
    .replace(/\s+[-–—]\s*[\p{L}\p{N}.&+_-]{2,30}\s*[:.!?]?$/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Deletes posts with associated image/storage cleanup (handled server-side).
 */
export async function deletePostsWithCleanup(postIds: string[]): Promise<void> {
  await api.post("/posts/bulk-delete", { ids: postIds });
}
