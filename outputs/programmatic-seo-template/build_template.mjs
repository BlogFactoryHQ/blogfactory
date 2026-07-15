import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/boragokce/Downloads/Rank_Prompt_20_Blog_SEO_Briefs.xlsx";
const outDir = "/Users/boragokce/Downloads/editorial-flow-main/outputs/programmatic-seo-template";
const outputPath = `${outDir}/BlogFactory_Programmatic_SEO_Template.xlsx`;

const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

const seo = workbook.worksheets.getItem("SEO_Strategy").getRange("A2:S21").values;
const brief = workbook.worksheets.getItem("Import_Brief").getRange("A2:G21").values;

const colors = {
  ink: "#111827",
  muted: "#6B7280",
  panel: "#FFFFFF",
  rail: "#F8FAFC",
  line: "#E5E7EB",
  orange: "#F97316",
  orangeSoft: "#FFF7ED",
  blue: "#2563EB",
  green: "#16A34A",
  red: "#DC2626",
};

const headers = [
  "ID",
  "Status",
  "Priority",
  "Cluster",
  "Funnel",
  "Persona",
  "Page type",
  "Template",
  "URL path",
  "H1 / title",
  "Slug",
  "Primary keyword",
  "Search intent",
  "Related keywords",
  "Meta title",
  "Meta title chars",
  "Meta description",
  "Meta description chars",
  "Outline / brief",
  "CTA",
  "Internal linking plan",
  "Official source URLs",
  "Proprietary data requirement",
  "Image plan",
  "Duplicate check",
  "QA status",
  "Notes",
];

function pageType(template) {
  const t = String(template || "").toLowerCase();
  if (t.includes("best-of")) return "Best-of";
  if (t.includes("list")) return "List post";
  if (t.includes("how-to")) return "How-to";
  if (t.includes("pillar")) return "Pillar";
  return "What is";
}

const rows = Array.from({ length: 100 }, (_, i) => {
  const s = seo[i] || [];
  const b = brief[i] || [];
  if (!s.length && !b.length) return Array(headers.length).fill(null);
  return [
    s[0],
    s[15],
    s[14],
    s[1],
    s[2],
    s[3],
    pageType(s[4]),
    s[4],
    s[5] ? `/${s[5]}/` : null,
    b[0],
    s[5],
    s[6] || b[1],
    b[2],
    s[7],
    b[3],
    null,
    b[4],
    null,
    b[5],
    b[6],
    s[10],
    s[12],
    s[8],
    s[11],
    s[13],
    null,
    s[9],
  ];
});

const template = workbook.worksheets.add("Programmatic_SEO_Template");
template.showGridLines = false;
template.getRange("A1:AA101").values = [headers, ...rows];
template.getRange("P2").formulas = [["=IF(O2=\"\",\"\",LEN(O2))"]];
template.getRange("P2:P101").fillDown();
template.getRange("R2").formulas = [["=IF(Q2=\"\",\"\",LEN(Q2))"]];
template.getRange("R2:R101").fillDown();
template.getRange("Z2").formulas = [["=IF(J2=\"\",\"\",IF(AND(P2<=60,R2>=140,R2<=160),\"OK\",\"Check\"))"]];
template.getRange("Z2:Z101").fillDown();

template.freezePanes.freezeRows(1);
const templateTable = template.tables.add("A1:AA101", true, "ProgrammaticSEOTemplate");
templateTable.style = "TableStyleLight1";
templateTable.showBandedRows = false;
template.getRange("A1:AA1").format = {
  fill: colors.orange,
  font: { bold: true, color: "#FFFFFF" },
  wrapText: true,
};
template.getRange("A1:AA101").format = {
  font: { color: colors.ink, typeface: "Carlito", fontSize: 10 },
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.line },
};
template.getRange("A1:AA1").format = {
  fill: colors.orange,
  font: { bold: true, color: "#FFFFFF", typeface: "Carlito", fontSize: 10 },
  wrapText: true,
};
template.getRange("B2:B101").dataValidation = {
  rule: { type: "list", values: ["Backlog", "Brief hazır", "Yazılıyor", "Edit", "Hazır", "Yayında"] },
};
template.getRange("E2:E101").dataValidation = {
  rule: { type: "list", values: ["Farkındalık", "Değerlendirme", "Karar"] },
};
template.getRange("G2:G101").dataValidation = {
  rule: { type: "list", values: ["What is", "How-to", "Pillar", "List post", "Best-of"] },
};
template.getRange("P2:P101").format.numberFormat = "0";
template.getRange("R2:R101").format.numberFormat = "0";

const widths = [7, 14, 8, 22, 16, 30, 13, 24, 18, 42, 28, 28, 24, 48, 34, 12, 48, 14, 70, 55, 44, 48, 58, 54, 42, 12, 58];
for (let i = 0; i < widths.length; i++) {
  template.getRangeByIndexes(0, i, 101, 1).format.columnWidth = widths[i];
}
template.getRange("A1:AA1").format.rowHeight = 34;
template.getRange("A2:AA101").format.rowHeight = 72;
template.getRange("P:P").format.horizontalAlignment = "center";
template.getRange("R:R").format.horizontalAlignment = "center";
template.getRange("Z:Z").format.horizontalAlignment = "center";

const importSheet = workbook.worksheets.add("BlogFactory_Import");
importSheet.showGridLines = false;
const importHeaders = ["H1 / title", "Primary keyword", "Search intent", "Meta title", "Meta description", "Outline / brief", "CTA"];
importSheet.getRange("A1:G101").values = [importHeaders, ...Array.from({ length: 100 }, () => Array(7).fill(null))];
const importFormulas = Array.from({ length: 100 }, (_, i) => {
  const r = i + 2;
  return [
    `=IF('Programmatic_SEO_Template'!J${r}="","",'Programmatic_SEO_Template'!J${r})`,
    `=IF('Programmatic_SEO_Template'!L${r}="","",'Programmatic_SEO_Template'!L${r})`,
    `=IF('Programmatic_SEO_Template'!M${r}="","",'Programmatic_SEO_Template'!M${r})`,
    `=IF('Programmatic_SEO_Template'!O${r}="","",'Programmatic_SEO_Template'!O${r})`,
    `=IF('Programmatic_SEO_Template'!Q${r}="","",'Programmatic_SEO_Template'!Q${r})`,
    `=IF('Programmatic_SEO_Template'!S${r}="","",'Programmatic_SEO_Template'!S${r})`,
    `=IF('Programmatic_SEO_Template'!T${r}="","",'Programmatic_SEO_Template'!T${r})`,
  ];
});
importSheet.getRange("A2:G101").formulas = importFormulas;
importSheet.freezePanes.freezeRows(1);
const importTable = importSheet.tables.add("A1:G101", true, "BlogFactoryImport");
importTable.style = "TableStyleLight1";
importTable.showBandedRows = false;
importSheet.getRange("A1:G101").format = {
  font: { color: colors.ink, typeface: "Carlito", fontSize: 10 },
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.line },
};
importSheet.getRange("A1:G1").format = {
  fill: colors.ink,
  font: { bold: true, color: "#FFFFFF", typeface: "Carlito", fontSize: 10 },
  wrapText: true,
};
for (const [col, width] of [
  ["A", 44],
  ["B", 26],
  ["C", 24],
  ["D", 34],
  ["E", 52],
  ["F", 78],
  ["G", 62],
]) {
  importSheet.getRange(`${col}1:${col}101`).format.columnWidth = width;
}
importSheet.getRange("A2:G101").format.rowHeight = 84;

const guide = workbook.worksheets.add("Template_Guide");
guide.showGridLines = false;
guide.getRange("A1:F1").merge();
guide.getRange("A1").values = [["BlogFactory Programmatic SEO Template"]];
guide.getRange("A1").format = {
  fill: colors.ink,
  font: { bold: true, color: "#FFFFFF", typeface: "Carlito", fontSize: 16 },
};
guide.getRange("A3:B10").values = [
  ["Alan", "Değer"],
  ["Ana çalışma sekmesi", "Programmatic_SEO_Template"],
  ["BlogFactory import sekmesi", "BlogFactory_Import!A:G"],
  ["Satır modeli", "Her satır tek bağımsız blog briefidir."],
  ["Zorunlu alanlar", "H1, primary keyword, search intent, meta title, meta description, outline, CTA"],
  ["QA kuralı", "Meta title <= 60; meta description 140-160 karakter."],
  ["İç link kuralı", "Yayınlanmamış URL için kırık link ekleme; editör görevi bırak."],
  ["Kaynak kuralı", "Resmi/birincil kaynakları kullan; ürün iddialarını yayın günü doğrula."],
];
guide.getRange("A12:B18").values = [
  ["Programmatic alan", "Nasıl kullanılır"],
  ["Cluster", "Aynı pillar altında üretilecek sayfa ailesi."],
  ["Funnel", "Farkındalık, değerlendirme veya karar niyeti."],
  ["Page type", "What is, how-to, pillar, list post veya best-of."],
  ["URL path", "Yayın URL deseni; slug değişirse güncelle."],
  ["Proprietary data requirement", "Yazıya eklenecek özgün test, tablo veya ölçüm görevi."],
  ["BlogFactory_Import", "Sadece A:G kolonlarını içeri al; geri kalan kolonlar operasyon kontrolüdür."],
];
guide.getRange("A3:B3").format = {
  fill: colors.orange,
  font: { bold: true, color: "#FFFFFF", typeface: "Carlito" },
};
guide.getRange("A12:B12").format = {
  fill: colors.blue,
  font: { bold: true, color: "#FFFFFF", typeface: "Carlito" },
};
guide.getRange("A3:B18").format = {
  font: { color: colors.ink, typeface: "Carlito", fontSize: 11 },
  wrapText: true,
  borders: { preset: "all", style: "thin", color: colors.line },
};
guide.getRange("A3:B3").format = {
  fill: colors.orange,
  font: { bold: true, color: "#FFFFFF", typeface: "Carlito", fontSize: 11 },
};
guide.getRange("A12:B12").format = {
  fill: colors.blue,
  font: { bold: true, color: "#FFFFFF", typeface: "Carlito", fontSize: 11 },
};
guide.getRange("A4:A10").format = { fill: colors.orangeSoft, font: { bold: true, color: colors.orange } };
guide.getRange("A13:A18").format = { fill: "#EFF6FF", font: { bold: true, color: colors.blue } };
guide.getRange("A:A").format.columnWidth = 28;
guide.getRange("B:B").format.columnWidth = 92;
guide.getRange("A3:B18").format.rowHeight = 42;

workbook.worksheets.getItem("Campaign_Overview").getRange("A1").values = [["BlogFactory Programmatic SEO Template — Rank Prompt"]];
workbook.worksheets.getItem("Campaign_Overview").getRange("E7").values = [["BlogFactory_Import!A:G"]];

const formulaErrors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 300 },
  summary: "final formula error scan",
});
console.log(formulaErrors.ndjson);

const templateCheck = await workbook.inspect({
  kind: "table",
  sheetId: "Programmatic_SEO_Template",
  range: "A1:AA8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 27,
  maxChars: 12000,
});
console.log(templateCheck.ndjson);

for (const name of [
  "Campaign_Overview",
  "Import_Brief",
  "SEO_Strategy",
  "Source_Library",
  "Campaign_Rules",
  "Programmatic_SEO_Template",
  "BlogFactory_Import",
  "Template_Guide",
]) {
  const preview = await workbook.render({ sheetName: name, autoCrop: "all", scale: 1, format: "png" });
  await fs.writeFile(`${outDir}/preview-${name}.png`, new Uint8Array(await preview.arrayBuffer()));
}

await fs.mkdir(outDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(outputPath);
