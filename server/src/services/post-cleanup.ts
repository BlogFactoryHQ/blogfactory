const AI_META_NOTE_PATTERNS = [
  /^\(?\s*toplam\s+kelime\s+sayısı.*\)?$/iu,
  /^\(?\s*(?:yukarıdaki\s+)?bağlantılar\b.*\b(?:iç\s+link|yerleştirilmiş|doğal\s+bağlam)\b.*\)?$/iu,
  /^\(?\s*(?:the\s+)?total\s+word\s+count\b.*\)?$/iu,
  /^\(?\s*internal\s+links?\b.*\b(?:placed|inserted|included)\b.*\)?$/iu,
  /^\s*not:\s+bu\s+i[çc]erik.*haz[ıi]rlanm[ıi][şs]t[ıi]r\.?$/iu,
  /^\s*bu\s+i[çc]erik.*haz[ıi]rlanm[ıi][şs]t[ıi]r\.?$/iu,
  /^\s*bu\s+yaz[ıi].*okuyucuyu.*y[öo]nlendirmi[şs]tir\.?$/iu,
];

function isAiMetaNote(line: string) {
  const text = line.trim();
  return AI_META_NOTE_PATTERNS.some((pattern) => pattern.test(text));
}

function normalizeGeneratedText(value: string) {
  return value
    .toLocaleLowerCase("tr")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[#>*_`~|()[\]{}"'“”‘’.,:;!?-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(value: string) {
  return value.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) || [];
}

function isMarkdownStructureBlock(block: string) {
  const text = block.trim();
  return /^#{1,6}\s+/.test(text) || /^[-*]\s+/m.test(text) || /^\|/m.test(text) || /^```/.test(text);
}

function endsWithSentencePunctuation(value: string) {
  return /[.!?…][)"'\]]*$/.test(value.trim());
}

function lastSentenceEndIndex(value: string) {
  return Math.max(value.lastIndexOf("."), value.lastIndexOf("!"), value.lastIndexOf("?"), value.lastIndexOf("…"));
}

function removeDanglingParagraphs(content: string) {
  const blocks = content.split(/\n{2,}/);
  return blocks
    .map((block, index) => {
      const trimmed = block.trim();
      if (!trimmed || isMarkdownStructureBlock(trimmed) || endsWithSentencePunctuation(trimmed)) return block;

      const next = blocks[index + 1]?.trim() || "";
      const beforeHeadingOrEnd = /^#{1,6}\s+/.test(next) || index === blocks.length - 1;
      if (!beforeHeadingOrEnd) return block;

      const endIndex = lastSentenceEndIndex(trimmed);
      if (endIndex < 0) return "";

      const completePart = trimmed.slice(0, endIndex + 1).trim();
      const danglingPart = trimmed.slice(endIndex + 1).trim();
      if (danglingPart.split(/\s+/).filter(Boolean).length < 3) return block;
      return completePart;
    })
    .filter((block) => block.trim())
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function removeRepeatedSentences(content: string) {
  const seen = new Set<string>();
  const blocks = content.split(/\n{2,}/).map((block) => {
    if (isMarkdownStructureBlock(block)) return block;
    const sentences = splitSentences(block);
    if (!sentences.length) return block;
    const kept = sentences.filter((sentence) => {
      const key = normalizeGeneratedText(sentence);
      if (key.length < 48) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return kept.join(" ");
  });
  return blocks.filter((block) => block.trim()).join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function cleanGeneratedPostContent(content: string) {
  const withoutDanglingParagraphs = removeDanglingParagraphs(content);
  const withoutRepeatedSentences = removeRepeatedSentences(withoutDanglingParagraphs);
  const lines = withoutRepeatedSentences.split(/\r?\n/);
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
