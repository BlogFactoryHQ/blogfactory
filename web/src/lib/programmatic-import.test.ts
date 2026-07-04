import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { parseProgrammaticImportFile, suggestProgrammaticTemplate } from "./programmatic-import";

async function workbookFile() {
  const zip = new JSZip();
  zip.file("xl/workbook.xml", `
    <workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
      <sheets><sheet name="startups" sheetId="1" r:id="rId1"/></sheets>
    </workbook>
  `);
  zip.file("xl/_rels/workbook.xml.rels", `
    <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
      <Relationship Id="rId1" Target="worksheets/sheet1.xml"/>
    </Relationships>
  `);
  zip.file("xl/sharedStrings.xml", `
    <sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <si><t>Startup</t></si>
      <si><t>Total Funding</t></si>
      <si><t>Judis AI</t></si>
      <si><t>Subfoxy</t></si>
    </sst>
  `);
  zip.file("xl/worksheets/sheet1.xml", `
    <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetData>
        <row r="1">
          <c r="A1" t="s"><v>0</v></c>
          <c r="B1" t="inlineStr"><is><t>Category</t></is></c>
          <c r="C1" t="s"><v>1</v></c>
        </row>
        <row r="2">
          <c r="A2" t="s"><v>2</v></c>
          <c r="B2" t="inlineStr"><is><t>Legaltech</t></is></c>
          <c r="C2" t="inlineStr"><is><t>$1M</t></is></c>
        </row>
        <row r="3"/>
        <row r="4">
          <c r="A4" t="s"><v>3</v></c>
          <c r="B4" t="inlineStr"><is><t>SaaS</t></is></c>
          <c r="C4" t="inlineStr"><is><t></t></is></c>
        </row>
      </sheetData>
    </worksheet>
  `);
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], "Recently Added Startups.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("programmatic import", () => {
  it("normalizes CSV headers and suggests a startup template", async () => {
    const file = new File(["Startup,Total Funding,Startup\nJudis AI,$1M,Duplicate"], "startups.csv", { type: "text/csv" });
    const imported = await parseProgrammaticImportFile(file);

    expect(imported.columns).toEqual(["startup", "total_funding", "startup_2"]);
    expect(imported.rows[0].startup).toBe("Judis AI");
    expect(imported.template.titleTemplate).toContain("{{startup}}");
  });

  it("parses XLSX shared and inline strings", async () => {
    const imported = await parseProgrammaticImportFile(await workbookFile());

    expect(imported.columns).toEqual(["startup", "category", "total_funding"]);
    expect(imported.rows).toHaveLength(2);
    expect(imported.rows[0]).toMatchObject({ startup: "Judis AI", category: "Legaltech", total_funding: "$1M" });
    expect(imported.template.titleTemplate).toBe("{{startup}} nedir? {{category}} alanındaki yeni girişim");
    expect(imported.campaignName).toBe("Recently Added Startups Campaign");
  });

  it("keeps suggested template variables aligned with row keys", () => {
    const columns = ["startup", "description", "category", "headquarter", "people", "links"];
    const template = suggestProgrammaticTemplate(columns);
    const serialized = JSON.stringify(template);

    expect(serialized).toContain("{{startup}}");
    expect(serialized).toContain("{{description}}");
    expect(serialized).toContain("{{category}}");
    expect(serialized).not.toContain("{{total_funding}}");
  });
});
