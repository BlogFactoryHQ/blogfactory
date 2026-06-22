import JSZip from "jszip";

export interface KnowledgeChunk {
  id: string;
  text: string;
}

export interface KnowledgeDocument {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  status?: "processing" | "ready" | "failed";
  chunks?: KnowledgeChunk[];
  error?: string;
}

export const KNOWLEDGE_IMPORT_CHAR_LIMIT = 30000;

export function limitKnowledgeContent(content: string) {
  if (content.length <= KNOWLEDGE_IMPORT_CHAR_LIMIT) return content;
  return `${content.slice(0, KNOWLEDGE_IMPORT_CHAR_LIMIT)}\n\n[Imported file truncated at ${KNOWLEDGE_IMPORT_CHAR_LIMIT.toLocaleString()} characters.]`;
}

export async function extractDocxText(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentXml = await zip.file("word/document.xml")?.async("text");
  if (!documentXml) throw new Error("Could not read DOCX content");
  const xml = new DOMParser().parseFromString(documentXml, "application/xml");
  return Array.from(xml.getElementsByTagName("w:t"))
    .map((node) => node.textContent || "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
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
    if (!current) current = section;
    else if (`${current}\n\n${section}`.length <= maxChars) current = `${current}\n\n${section}`;
    else {
      chunks.push({ id: `chunk-${chunks.length + 1}`, text: current });
      current = section;
    }
  }

  if (current) chunks.push({ id: `chunk-${chunks.length + 1}`, text: current });
  return chunks;
}

export function knowledgeChunkCount(document: KnowledgeDocument) {
  return document.chunks?.length || chunkKnowledgeContent(document.content || "").length;
}

export function knowledgeStatus(document: KnowledgeDocument) {
  return document.status || "ready";
}

export function createKnowledgeDocument(title: string, content: string): KnowledgeDocument {
  const trimmed = limitKnowledgeContent(content.trim());
  if (!trimmed) throw new Error("No readable text found in that file");
  return {
    id: crypto.randomUUID(),
    title,
    content: trimmed,
    status: "ready",
    chunks: chunkKnowledgeContent(trimmed),
    createdAt: new Date().toISOString(),
  };
}
