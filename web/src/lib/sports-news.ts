import JSZip from "jszip";

export interface SportsMatrixRow {
  region?: string;
  sport?: string;
  beat?: string;
  reliability?: number;
  sourceName: string;
  sportTag?: string;
  sourceType?: string;
  category?: string;
  speed?: string;
  trust?: string;
  publishRule?: string;
  tags?: string;
  embedSource?: string;
  siteLink?: string;
  xLink?: string;
  otherLink?: string;
  status?: string;
  note?: string;
}

const HEADER_MAP: Record<string, keyof SportsMatrixRow> = {
  "bölge / lig / yarışma": "region",
  "branş": "sport",
  "kulüp / odak (beat)": "beat",
  "güvenilirlik (1-5)": "reliability",
  "kaynak / hesap": "sourceName",
  "branş etiketi": "sportTag",
  "kaynak tipi": "sourceType",
  "tür / alt kategori": "category",
  "hız": "speed",
  "güven": "trust",
  "yayın kuralı (bot davranışı)": "publishRule",
  "otomatik etiketler (tags)": "tags",
  "veri kaynağı (embed)": "embedSource",
  "site linki": "siteLink",
  "x linki": "xLink",
  "diğer link": "otherLink",
  "durum": "status",
  "not": "note",
};

function textFromXml(xml: string, tag: string) {
  return Array.from(new DOMParser().parseFromString(xml, "application/xml").getElementsByTagName(tag))
    .map((node) => node.textContent || "")
    .join("");
}

function colIndex(ref: string) {
  const col = ref.match(/[A-Z]+/)?.[0] || "A";
  return col.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function norm(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("tr");
}

function searchable(value: unknown) {
  return typeof value === "string"
    ? value
        .replace(/\s+/g, " ")
        .trim()
        .toLocaleLowerCase("tr")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i")
        .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ@._/-]+/gi, " ")
    : "";
}

function host(value: string) {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname
      .replace(/^www\./, "")
      .toLocaleLowerCase("tr");
  } catch {
    return "";
  }
}

function handleFromUrl(value?: string) {
  try {
    return new URL(value || "").pathname.split("/").filter(Boolean)[0] || "";
  } catch {
    return "";
  }
}

function sourceLinks(row: SportsMatrixRow) {
  return [row.siteLink, row.xLink, row.otherLink].map((value) => (value || "").trim()).filter(Boolean);
}

async function sharedStrings(zip: JSZip) {
  const xml = await zip.file("xl/sharedStrings.xml")?.async("text");
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagName("si")).map((node) =>
    Array.from(node.getElementsByTagName("t")).map((part) => part.textContent || "").join("")
  );
}

async function matrixSheetPath(zip: JSZip) {
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbookXml || !relsXml) throw new Error("Could not read workbook metadata");

  const workbook = new DOMParser().parseFromString(workbookXml, "application/xml");
  const sheet = Array.from(workbook.getElementsByTagName("sheet"))
    .find((node) => norm(node.getAttribute("name") || "") === "haber matrisi");
  const relId = sheet?.getAttribute("r:id");
  if (!relId) throw new Error("Haber Matrisi sheet not found");

  const rels = new DOMParser().parseFromString(relsXml, "application/xml");
  const target = Array.from(rels.getElementsByTagName("Relationship"))
    .find((node) => node.getAttribute("Id") === relId)
    ?.getAttribute("Target");
  if (!target) throw new Error("Haber Matrisi worksheet target not found");
  return `xl/${target.replace(/^\/?xl\//, "")}`;
}

export async function parseSportsMatrixFile(file: File): Promise<SportsMatrixRow[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const strings = await sharedStrings(zip);
  const path = await matrixSheetPath(zip);
  const xml = await zip.file(path)?.async("text");
  if (!xml) throw new Error("Could not read Haber Matrisi worksheet");

  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const rows = Array.from(doc.getElementsByTagName("row")).map((row) => {
    const values: string[] = [];
    Array.from(row.getElementsByTagName("c")).forEach((cell) => {
      const index = colIndex(cell.getAttribute("r") || "A");
      const type = cell.getAttribute("t");
      const raw = type === "inlineStr" ? textFromXml(new XMLSerializer().serializeToString(cell), "t") : cell.getElementsByTagName("v")[0]?.textContent || "";
      values[index] = type === "s" ? strings[Number(raw)] || "" : raw;
    });
    return values.map((value) => (value || "").trim());
  });

  const headerIndex = rows.findIndex((row) => row.some((cell) => norm(cell) === "kaynak / hesap"));
  if (headerIndex < 0) throw new Error("Matrix headers not found");

  const headers = rows[headerIndex].map((header) => HEADER_MAP[norm(header)]);
  return rows.slice(headerIndex + 1)
    .map((row) => {
      const item: Partial<SportsMatrixRow> = {};
      headers.forEach((key, index) => {
        if (!key || !row[index]) return;
        if (key === "reliability") item[key] = Number(row[index]) || undefined;
        else item[key] = row[index] as never;
      });
      return item as SportsMatrixRow;
    })
    .filter((row) => row.sourceName);
}

export function sportsMatrixStats(rows: SportsMatrixRow[]) {
  const active = rows.filter((row) => norm(row.status || "").includes("aktif")).length;
  return { total: rows.length, active, passive: rows.length - active };
}

export function newsRuleLabel(row: SportsMatrixRow) {
  const type = searchable(row.sourceType);
  const rule = searchable(row.publishRule);
  const reliability = row.reliability || 0;
  if (type.includes("resmi") || rule.includes("resmi")) return "[RESMÎ]";
  if (/ajans|kurum/.test(type) || rule.includes("dogrulanmis")) return "[DOĞRULANMIŞ HABER]";
  if (type.includes("insider") && reliability >= 5) return "[MANŞET - ATIFLI]";
  if (reliability >= 4 || rule.includes("tier 2")) return "[AKIŞ HABERİ]";
  return "[SÖYLENTİ HAVUZU]";
}

export function matchSportsMatrixRow(value: string, rows: SportsMatrixRow[]) {
  const haystack = searchable(value);
  const candidateHost = host(value);
  const match = rows
    .filter((row) => row.sourceName)
    .map((row) => {
      let score = 0;
      const sourceName = searchable(row.sourceName);
      if (sourceName && haystack.includes(sourceName)) score += sourceName.length > 8 ? 8 : 5;
      const xHandle = searchable(handleFromUrl(row.xLink));
      if (xHandle && haystack.includes(xHandle)) score += 8;
      for (const link of sourceLinks(row)) {
        const linkHost = host(link);
        if (!linkHost) continue;
        if (candidateHost && candidateHost === linkHost) score += 10;
        else if (haystack.includes(searchable(linkHost))) score += 4;
      }
      return { row, score };
    })
    .sort((a, b) => b.score - a.score)[0];
  return match?.score ? match.row : null;
}
