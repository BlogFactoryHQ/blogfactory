import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const inputPath = "/Users/boragokce/Downloads/Rank_Prompt_20_Blog_SEO_Briefs.xlsx";
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

for (const [sheetName, range] of [
  ["SEO_Strategy", "A1:S21"],
  ["Source_Library", "A1:E20"],
]) {
  const values = workbook.worksheets.getItem(sheetName).getRange(range).values;
  console.log(`\n## ${sheetName}`);
  for (const row of values) console.log(row.map((v) => v ?? "").join("\t"));
}
