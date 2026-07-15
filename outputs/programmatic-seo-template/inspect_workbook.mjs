import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/boragokce/Downloads/Rank_Prompt_20_Blog_SEO_Briefs.xlsx";
const outDir = "/Users/boragokce/Downloads/editorial-flow-main/outputs/programmatic-seo-template";

const input = await FileBlob.load(inputPath);
const workbook = await SpreadsheetFile.importXlsx(input);

const summary = await workbook.inspect({
  kind: "workbook,sheet,table",
  maxChars: 12000,
  tableMaxRows: 8,
  tableMaxCols: 20,
  tableMaxCellChars: 120,
});
console.log(summary.ndjson);

const sheets = await workbook.inspect({ kind: "sheet", include: "id,name" });
console.log(sheets.ndjson);

for (const name of ["SEO_Strategy", "Source_Library", "Campaign_Rules"]) {
  const sheetSummary = await workbook.inspect({
    kind: "table,computedStyle",
    sheetId: name,
    range: "A1:S25",
    maxChars: 16000,
    tableMaxRows: 24,
    tableMaxCols: 20,
    tableMaxCellChars: 140,
  });
  console.log(sheetSummary.ndjson);
}

const firstSheet = workbook.worksheets.getItemAt(0);
const preview = await workbook.render({
  sheetName: firstSheet.name,
  autoCrop: "all",
  scale: 1,
  format: "png",
});
await fs.writeFile(`${outDir}/source-preview.png`, new Uint8Array(await preview.arrayBuffer()));
