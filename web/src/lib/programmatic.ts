export type ProgrammaticDataMode = "all_combinations" | "match_rows";
export type ProgrammaticRow = Record<string, string>;

export interface ProgrammaticSection {
  id: string;
  type: string;
  heading: string;
  instructions: string;
  minWords?: number;
  maxWords?: number;
  snippable?: boolean;
  required?: boolean;
}

export interface ProgrammaticTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  titleTemplate: string;
  wordRange: [number, number];
  requiredVariables: string[];
  sections: ProgrammaticSection[];
  builtIn?: boolean;
}

const variablePattern = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;
export const MAX_PROGRAMMATIC_ROWS = 1000;

export function extractVariables(value: string) {
  const found: string[] = [];
  value.replace(variablePattern, (_match, name: string) => {
    if (!found.includes(name)) found.push(name);
    return "";
  });
  return found;
}

export function templateVariables(template: ProgrammaticTemplate) {
  return Array.from(new Set([
    ...template.requiredVariables,
    ...extractVariables(template.titleTemplate),
    ...template.sections.flatMap((section) => [
      ...extractVariables(section.heading),
      ...extractVariables(section.instructions),
    ]),
  ].filter(Boolean)));
}

export function renderTemplateText(value: string, row: ProgrammaticRow) {
  return value.replace(variablePattern, (_match, name: string) => row[name] ?? "");
}

export function renderTemplate(template: ProgrammaticTemplate, row: ProgrammaticRow) {
  return {
    title: renderTemplateText(template.titleTemplate, row),
    sections: template.sections.map((section) => ({
      ...section,
      heading: renderTemplateText(section.heading, row),
      instructions: renderTemplateText(section.instructions, row),
    })),
  };
}

export function parseCsv(text: string) {
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

  const columns = (table[0] || []).map((column) => column.trim()).filter(Boolean);
  const rows = table.slice(1).map((values) => {
    const record: ProgrammaticRow = {};
    columns.forEach((column, index) => {
      record[column] = values[index]?.trim() || "";
    });
    return record;
  }).filter((record) => Object.values(record).some(Boolean));
  return { columns, rows };
}

export function buildCombinations(values: Record<string, string[]>, maxRows = MAX_PROGRAMMATIC_ROWS) {
  const entries = Object.entries(values)
    .map(([key, list]) => [key, list.map((value) => String(value).trim()).filter(Boolean)] as const)
    .filter(([, list]) => list.length);
  if (!entries.length) return [];

  let rows: ProgrammaticRow[] = [{}];
  for (const [key, list] of entries) {
    rows = rows.flatMap((item) => list.map((value) => ({ ...item, [key]: value })));
    if (rows.length > maxRows) throw new Error(`Programmatic campaigns support up to ${maxRows} rows`);
  }
  return rows;
}

export function validateRows(template: ProgrammaticTemplate, rows: ProgrammaticRow[]) {
  const variables = templateVariables(template);
  const errors: string[] = [];
  if (!rows.length) errors.push("Add at least one row.");
  if (rows.length > MAX_PROGRAMMATIC_ROWS) errors.push(`Programmatic campaigns support up to ${MAX_PROGRAMMATIC_ROWS} rows.`);
  rows.forEach((row, index) => {
    const missing = variables.filter((variable) => !String(row[variable] || "").trim());
    if (missing.length) errors.push(`Row ${index + 1} missing ${missing.join(", ")}.`);
  });
  return errors;
}

export function scoreProgrammaticTemplate(template: ProgrammaticTemplate) {
  const variables = templateVariables(template);
  const nonTitleSections = template.sections.filter((section) => section.type !== "title");
  const hasFaq = template.sections.some((section) => section.type === "faq" || /faq/i.test(section.heading));
  const hasIntro = template.sections.some((section) => section.type === "introduction" || /intro|what.*know/i.test(section.heading));
  const hasConclusion = template.sections.some((section) => section.type === "conclusion" || section.type === "cta");
  const wordTargets = nonTitleSections.filter((section) => section.minWords || section.maxWords).length;
  const snippable = template.sections.filter((section) => section.snippable).length;
  const score = Math.min(100,
    (template.titleTemplate && extractVariables(template.titleTemplate).length ? 18 : 0) +
    Math.min(25, nonTitleSections.length * 3) +
    Math.min(20, wordTargets * 3) +
    Math.min(17, variables.length * 4) +
    (hasFaq ? 8 : 0) +
    (hasIntro ? 6 : 0) +
    (hasConclusion ? 4 : 0) +
    Math.min(2, snippable));
  const quickWins = [
    ...(!hasFaq ? ["Add an FAQ section"] : []),
    ...(!hasIntro ? ["Add an introduction"] : []),
    ...(!hasConclusion ? ["Add a conclusion or CTA"] : []),
    ...(snippable < 2 ? ["Mark more sections as snippable"] : []),
  ];
  return { score, variables, quickWins };
}
