import JSZip from "jszip";
import { MAX_PROGRAMMATIC_ROWS, type ProgrammaticRow, type ProgrammaticTemplate } from "./programmatic";

export interface ProgrammaticImportResult {
  columns: string[];
  originalColumns: string[];
  rows: ProgrammaticRow[];
  template: ProgrammaticTemplate;
  campaignName: string;
  datasetName: string;
}

const TURKISH_CHARS: Record<string, string> = {
  ç: "c",
  Ç: "c",
  ğ: "g",
  Ğ: "g",
  ı: "i",
  I: "i",
  İ: "i",
  ö: "o",
  Ö: "o",
  ş: "s",
  Ş: "s",
  ü: "u",
  Ü: "u",
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

function readFileAsText(file: File) {
  if ("text" in file && typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsText(file);
  });
}

function readFileAsArrayBuffer(file: File) {
  if ("arrayBuffer" in file && typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsArrayBuffer(file);
  });
}

function normalizeHeader(value: string, index: number, used: Set<string>) {
  const ascii = value
    .replace(/[çÇğĞıIİöÖşŞüÜ]/g, (char) => TURKISH_CHARS[char] || char)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
  const base = ascii
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "field_$1") || `column_${index + 1}`;
  let next = base;
  let suffix = 2;
  while (used.has(next)) {
    next = `${base}_${suffix}`;
    suffix += 1;
  }
  used.add(next);
  return next;
}

function normalizeTable(originalColumns: string[], rawRows: string[][]) {
  const used = new Set<string>();
  const columns = originalColumns.map((column, index) => normalizeHeader(column, index, used));
  const rows = rawRows
    .slice(0, MAX_PROGRAMMATIC_ROWS)
    .map((values) => {
      const row: ProgrammaticRow = {};
      columns.forEach((column, index) => {
        row[column] = (values[index] || "").trim();
      });
      return row;
    })
    .filter((row) => Object.values(row).some(Boolean));
  return { columns, rows };
}

function parseDelimitedTable(text: string) {
  const cleaned = text.replace(/^\uFEFF/, "");
  const firstLine = cleaned.split(/\r?\n/).find((line) => line.trim()) || "";
  const delimiter = (firstLine.match(/\t/g)?.length || 0) > (firstLine.match(/,/g)?.length || 0) ? "\t" : ",";
  const table: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i += 1) {
    const char = cleaned[i];
    const next = cleaned[i + 1];
    if (char === "\"") {
      if (inQuotes && next === "\"") {
        field += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      row.push(field.trim());
      field = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(field.trim());
      if (row.some(Boolean)) table.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) table.push(row);
  const originalColumns = (table[0] || []).map((column, index) => column.trim() || `Column ${index + 1}`);
  const rawRows = table.slice(1).filter((item) => item.some(Boolean));
  return { ...normalizeTable(originalColumns, rawRows), originalColumns };
}

function findHeaderRow(rows: string[][]) {
  let bestIndex = -1;
  let bestScore = 0;
  rows.forEach((row, index) => {
    const filled = row.filter((cell) => cell.trim()).length;
    const textLike = row.filter((cell) => /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(cell)).length;
    const score = filled + textLike;
    if (filled >= 2 && score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex;
}

async function sharedStrings(zip: JSZip) {
  const xml = await zip.file("xl/sharedStrings.xml")?.async("text");
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return Array.from(doc.getElementsByTagName("si")).map((node) =>
    Array.from(node.getElementsByTagName("t")).map((part) => part.textContent || "").join("")
  );
}

async function worksheetPaths(zip: JSZip) {
  const workbookXml = await zip.file("xl/workbook.xml")?.async("text");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels")?.async("text");
  if (!workbookXml || !relsXml) throw new Error("Could not read workbook metadata");

  const workbook = new DOMParser().parseFromString(workbookXml, "application/xml");
  const rels = new DOMParser().parseFromString(relsXml, "application/xml");
  return Array.from(workbook.getElementsByTagName("sheet"))
    .map((sheet) => {
      const relId = sheet.getAttribute("r:id");
      const target = Array.from(rels.getElementsByTagName("Relationship"))
        .find((node) => node.getAttribute("Id") === relId)
        ?.getAttribute("Target");
      return target ? `xl/${target.replace(/^\/?xl\//, "")}` : "";
    })
    .filter(Boolean);
}

function cellText(cell: Element, strings: string[]) {
  const type = cell.getAttribute("t");
  const raw = type === "inlineStr"
    ? textFromXml(new XMLSerializer().serializeToString(cell), "t")
    : cell.getElementsByTagName("v")[0]?.textContent || "";
  if (type === "s") return strings[Number(raw)] || "";
  return raw;
}

async function parseXlsx(file: File) {
  const zip = await JSZip.loadAsync(await readFileAsArrayBuffer(file));
  const strings = await sharedStrings(zip);
  const paths = await worksheetPaths(zip);

  for (const path of paths) {
    const xml = await zip.file(path)?.async("text");
    if (!xml) continue;
    const doc = new DOMParser().parseFromString(xml, "application/xml");
    const table = Array.from(doc.getElementsByTagName("row")).map((row) => {
      const values: string[] = [];
      Array.from(row.getElementsByTagName("c")).forEach((cell) => {
        values[colIndex(cell.getAttribute("r") || "A")] = cellText(cell, strings).trim();
      });
      return values.map((value) => value || "");
    });

    const headerIndex = findHeaderRow(table);
    if (headerIndex < 0) continue;
    const originalColumns = table[headerIndex].map((header, index) => header.trim() || `Column ${index + 1}`);
    const rawRows = table.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim()));
    const normalized = normalizeTable(originalColumns, rawRows);
    if (normalized.rows.length) return { ...normalized, originalColumns };
  }

  throw new Error("No usable table found in this workbook");
}

function includesAny(value: string, terms: string[]) {
  return terms.some((term) => value === term || value.includes(term));
}

function firstColumn(columns: string[], terms: string[]) {
  return columns.find((column) => includesAny(column, terms));
}

function section(id: string, type: string, heading: string, instructions: string, minWords = 120, maxWords = 180) {
  return { id, type, heading, instructions, minWords, maxWords };
}

function buildStartupTemplate(columns: string[]): ProgrammaticTemplate {
  const startup = firstColumn(columns, ["startup", "company", "business", "name"]) || columns[0];
  const category = firstColumn(columns, ["category", "sector", "industry"]);
  const description = firstColumn(columns, ["description", "summary", "about"]);
  const headquarter = firstColumn(columns, ["headquarter", "headquarters", "location", "city", "country"]);
  const people = firstColumn(columns, ["people", "founder", "team"]);
  const funding = firstColumn(columns, ["total_funding", "funding"]);
  const lastFunding = firstColumn(columns, ["last_funding", "last_round", "round"]);
  const legal = firstColumn(columns, ["legal_business_name", "legal_name"]);
  const status = firstColumn(columns, ["status"]);
  const links = firstColumn(columns, ["links", "link", "url", "website"]);
  const categoryPhrase = category ? ` {{${category}}} alanındaki yeni girişim` : "";
  const sections = [
    { id: "title", type: "title", heading: `{{${startup}}} nedir?${categoryPhrase}`, instructions: "Use as the article H1 title." },
    section("intro", "introduction", `{{${startup}}} nedir?`, [
      `{{${startup}}} hakkında kısa ve net bir giriş yaz.`,
      description ? `Şirket açıklamasını temel al: {{${description}}}.` : "",
      category ? `Kategori bağlamını açıkla: {{${category}}}.` : "",
    ].filter(Boolean).join(" "), 120, 180),
    section("product", "text", `{{${startup}}} ne yapıyor?`, [
      "Ürünün veya servisin hangi problemi çözdüğünü, hedef kullanıcıyı ve değer önerisini anlat.",
      description ? `Açıklama verisini kullan: {{${description}}}.` : "",
    ].filter(Boolean).join(" "), 180, 260),
    section("market", "text", "Kategori ve pazar", [
      category ? `{{${category}}} kategorisindeki konumunu yorumla.` : "Tablodaki kategori ve açıklama verilerinden pazar bağlamını çıkar.",
      headquarter ? `Lokasyon bilgisini bağlama ekle: {{${headquarter}}}.` : "",
    ].filter(Boolean).join(" "), 160, 240),
    section("team", "text", "Ekip, lokasyon ve kuruluş bilgileri", [
      people ? `Kurucu veya ekip bilgisini kullan: {{${people}}}.` : "Ekip bilgisi yoksa bunu uydurma; şirket profiline odaklan.",
      headquarter ? `Merkez bilgisini belirt: {{${headquarter}}}.` : "",
      status ? `Durum bilgisini aktar: {{${status}}}.` : "",
    ].filter(Boolean).join(" "), 120, 200),
    section("funding", "text", "Funding ve şirket bilgileri", [
      funding ? `Toplam funding bilgisini belirt: {{${funding}}}.` : "",
      lastFunding ? `Son funding bilgisini bağlama ekle: {{${lastFunding}}}.` : "",
      legal ? `Legal şirket adı varsa kullan: {{${legal}}}.` : "",
      links ? `Website/link bilgisini kaynak olarak kullan: {{${links}}}.` : "",
      "Eksik finansal bilgileri tahmin etme.",
    ].filter(Boolean).join(" "), 120, 200),
    section("takeaway", "conclusion", `{{${startup}}} hakkında kısa değerlendirme`, "Okur için kısa bir değerlendirme yap; startup'ın neden takip edilmeye değer olabileceğini ve hangi soruları açık bıraktığını özetle.", 100, 150),
  ];

  return {
    id: "auto-startup-profile",
    name: "Startup Profile",
    description: "Create one profile article per startup row.",
    category: "Startup",
    titleTemplate: `{{${startup}}} nedir?${categoryPhrase}`,
    wordRange: [900, 1230],
    requiredVariables: [],
    sections,
  };
}

function buildServiceTemplate(columns: string[]): ProgrammaticTemplate {
  const service = firstColumn(columns, ["service", "product", "tool", "solution"]) || columns[0];
  const location = firstColumn(columns, ["city", "location", "country", "state", "region"]);
  const category = firstColumn(columns, ["category", "sector", "industry"]);
  const titleTemplate = location ? `{{${service}}} in {{${location}}}: Complete Guide` : `{{${service}}}: Complete Guide`;
  return {
    id: "auto-service-guide",
    name: "Service Guide",
    description: "Create one guide per product or service row.",
    category: "Programmatic",
    titleTemplate,
    wordRange: [850, 1150],
    requiredVariables: [],
    sections: [
      { id: "title", type: "title", heading: titleTemplate, instructions: "Use as the article H1 title." },
      section("overview", "introduction", `What to know about {{${service}}}`, "Explain the service, product, or solution in practical terms.", 120, 180),
      section("fit", "text", "Who this is for", category ? `Use the category context: {{${category}}}. Explain ideal users and use cases.` : "Explain ideal users and use cases.", 180, 260),
      section("details", "text", "Key details", "Use the row data to cover important facts without inventing missing claims.", 180, 260),
      section("faq", "faq", "FAQ", "Answer common questions a reader would have before choosing this option.", 180, 260),
    ],
  };
}

function buildSeoContentBriefTemplate(columns: string[]): ProgrammaticTemplate {
  const title = firstColumn(columns, ["blog_title_h1", "h1", "title"]) || columns[0];
  const primaryKeyword = firstColumn(columns, ["primary_keyword", "keyword"]);
  const secondaryKeywords = firstColumn(columns, ["secondary_keywords", "related_keywords", "keywords"]);
  const intent = firstColumn(columns, ["search_intent", "intent"]);
  const metaTitle = firstColumn(columns, ["meta_title", "seo_title"]);
  const metaDescription = firstColumn(columns, ["meta_description", "seo_description"]);
  const outline = firstColumn(columns, ["outline_summary", "outline", "brief"]);
  const cta = firstColumn(columns, ["cta", "call_to_action"]);

  return {
    id: "auto-seo-content-brief",
    name: "SEO Content Brief",
    description: "Create one SEO article per imported brief row, using title, keywords, intent, meta fields, outline, and CTA.",
    category: "SEO",
    titleTemplate: `{{${title}}}`,
    wordRange: [900, 1250],
    requiredVariables: [],
    sections: [
      { id: "title", type: "title", heading: `{{${title}}}`, instructions: "Use as the exact article H1 title." },
      section("intro", "introduction", `{{${title}}}`, [
        "Yazıya doğrudan konu ve okuyucu ihtiyacıyla başla.",
        primaryKeyword ? `Ana anahtar kelimeyi doğal kullan: {{${primaryKeyword}}}.` : "",
        intent ? `Arama niyetini karşıla: {{${intent}}}.` : "",
      ].filter(Boolean).join(" "), 120, 180),
      section("brief", "text", "Konu kapsamı ve temel noktalar", [
        outline ? `Şu outline özetini ana plan olarak kullan: {{${outline}}}.` : "Satırdaki brief verisini ana plan olarak kullan.",
        secondaryKeywords ? `İlgili kelimeleri doğal bağlamda işle: {{${secondaryKeywords}}}.` : "",
        "Eksik teknik iddiaları uydurma; belirsiz kalan yerlerde genel ve güvenli ifade kullan.",
      ].filter(Boolean).join(" "), 360, 520),
      section("seo", "text", "SEO notları", [
        metaTitle ? `Meta title hedefi: {{${metaTitle}}}.` : "",
        metaDescription ? `Meta description hedefi: {{${metaDescription}}}.` : "",
        primaryKeyword ? `Anahtar kelime odağını metin boyunca koru: {{${primaryKeyword}}}.` : "",
      ].filter(Boolean).join(" "), 120, 180),
      section("faq", "faq", "Sık sorulan sorular", [
        "Okurun satın alma, teknik değerlendirme veya uygulama kararını destekleyen 3-5 kısa soru-cevap üret.",
        intent ? `Soruları şu niyete göre seç: {{${intent}}}.` : "",
      ].filter(Boolean).join(" "), 180, 260),
      section("cta", "cta", "Sonraki adım", cta ? `CTA mesajını doğal biçimde işle: {{${cta}}}.` : "Okuru net bir sonraki adıma yönlendir.", 80, 120),
    ],
  };
}

function buildGenericTemplate(columns: string[]): ProgrammaticTemplate {
  const primary = columns[0] || "topic";
  return {
    id: "auto-row-profile",
    name: "Row Profile",
    description: "Create one profile article per imported row.",
    category: "Programmatic",
    titleTemplate: `{{${primary}}} rehberi`,
    wordRange: [700, 950],
    requiredVariables: [],
    sections: [
      { id: "title", type: "title", heading: `{{${primary}}} rehberi`, instructions: "Use as the article H1 title." },
      section("overview", "introduction", `{{${primary}}} hakkında genel bakış`, "Tablodaki verileri kullanarak kısa bir giriş yaz.", 120, 180),
      section("details", "text", "Öne çıkan bilgiler", `Bu satırdaki alanları bağlam içinde açıkla: ${columns.map((column) => `{{${column}}}`).join(", ")}.`, 220, 320),
      section("takeaway", "conclusion", "Kısa değerlendirme", "Okur için ana çıkarımları toparla ve eksik verileri uydurma.", 100, 150),
    ],
  };
}

export function suggestProgrammaticTemplate(columns: string[]) {
  if (firstColumn(columns, ["blog_title_h1", "h1", "title"]) && firstColumn(columns, ["primary_keyword", "keyword"])) {
    return buildSeoContentBriefTemplate(columns);
  }
  if (firstColumn(columns, ["startup", "company", "business"]) || (firstColumn(columns, ["category"]) && firstColumn(columns, ["funding", "founder", "people"]))) {
    return buildStartupTemplate(columns);
  }
  if (firstColumn(columns, ["service", "product", "tool", "solution"])) {
    return buildServiceTemplate(columns);
  }
  return buildGenericTemplate(columns);
}

function nameFromFile(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || "Imported Data";
}

export async function parseProgrammaticImportFile(file: File): Promise<ProgrammaticImportResult> {
  const isXlsx = /\.xlsx$/i.test(file.name) || /spreadsheetml\.sheet/i.test(file.type);
  const table = isXlsx ? await parseXlsx(file) : await parseCsvFile(file);
  const template = suggestProgrammaticTemplate(table.columns);
  const baseName = nameFromFile(file.name);
  return {
    ...table,
    template,
    campaignName: `${baseName} Campaign`,
    datasetName: `${baseName} Dataset`,
  };
}

async function parseCsvFile(file: File) {
  const unsupported = !/\.csv$/i.test(file.name) && file.type && !/csv|plain/i.test(file.type);
  if (unsupported) throw new Error("Import a CSV or XLSX file");
  return parseDelimitedTable(await readFileAsText(file));
}
