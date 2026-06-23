import { strict as assert } from "node:assert";
import type { ParsedCampaignItem } from "./campaign-parser.js";

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

export interface ProgrammaticCampaignPayload {
  template: ProgrammaticTemplate;
  dataMode?: ProgrammaticDataMode;
  rows?: ProgrammaticRow[];
  variableValues?: Record<string, string[]>;
}

const variablePattern = /\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g;
const MAX_PROGRAMMATIC_ROWS = 1000;

export const BUILT_IN_PROGRAMMATIC_TEMPLATES: ProgrammaticTemplate[] = [
  {
    id: "builtin-local-seo",
    name: "Location Service Pages",
    description: "Create city-specific landing pages that rank for '[service] in [city]' queries.",
    category: "Local SEO",
    titleTemplate: "Best {{service}} in {{city}}, {{state}} | {{year}} Guide",
    wordRange: [1280, 1870],
    requiredVariables: ["service", "city", "state", "year"],
    builtIn: true,
    sections: [
      {
        id: "title",
        type: "title",
        heading: "Best {{service}} in {{city}}, {{state}} | {{year}} Guide",
        instructions: "Use as the article H1 title.",
      },
      {
        id: "quick-facts",
        type: "text",
        heading: "{{city}} {{service}} Quick Facts",
        instructions: "Provide 4-5 key facts about {{service}} in {{city}}: typical pricing range, response time, service area coverage, and what makes local providers stand out. Give searchers immediate value.",
        minWords: 80,
        maxWords: 120,
        snippable: true,
      },
      {
        id: "need-to-know",
        type: "introduction",
        heading: "{{service}} in {{city}}: What You Need to Know",
        instructions: "Introduce {{service}} in the context of {{city}}, {{state}}. Cover what services are available, the local market landscape, and why location matters for this service type. Reference specific neighborhoods or areas of {{city}} where possible.",
        minWords: 150,
        maxWords: 250,
      },
      {
        id: "top-options",
        type: "text",
        heading: "Top {{service}} Options in {{city}}",
        instructions: "Break down the {{service}} options available to {{city}} residents by tier: budget-friendly, mid-range, and premium. Include typical pricing for each tier, what's included, and who each option is best for. Reference {{city}}-specific factors that affect availability.",
        minWords: 300,
        maxWords: 400,
      },
      {
        id: "choose",
        type: "text",
        heading: "How to Choose the Right {{service}} in {{city}}",
        instructions: "Create a decision framework for {{city}} residents selecting {{service}}. Cover: licensing/certification requirements in {{state}}, questions to ask providers, red flags to watch for, and how to verify credentials. Make it actionable.",
        minWords: 200,
        maxWords: 300,
      },
      {
        id: "market",
        type: "text",
        heading: "{{city}} {{service}} Market in {{year}}",
        instructions: "Provide current market context for {{service}} in {{city}}, {{state}}. Cover local demand trends, seasonal considerations, any recent regulatory changes, and how {{city}}'s market compares to the rest of {{state}}. Include specific data where available.",
        minWords: 200,
        maxWords: 300,
      },
      {
        id: "faq",
        type: "faq",
        heading: "{{city}} {{service}} FAQ",
        instructions: "Answer the specific questions {{city}} residents have about {{service}}: local pricing, timing, permits needed, and provider recommendations. Make answers locally relevant.",
        minWords: 250,
        maxWords: 350,
        snippable: true,
      },
      {
        id: "cta",
        type: "cta",
        heading: "Get {{service}} in {{city}} Today",
        instructions: "Create a compelling call-to-action for {{city}} residents. Include: how to get started, what to have ready, expected timeline, and any current promotions. Instill confidence and reduce friction.",
        minWords: 100,
        maxWords: 150,
      },
    ],
  },
  {
    id: "builtin-product-comparison",
    name: "Product Comparison Pages",
    description: "Compare two products and capture high-intent 'vs' searches.",
    category: "Comparison",
    titleTemplate: "{{product_a}} vs {{product_b}}: Which Is Better in {{year}}?",
    wordRange: [1450, 1900],
    requiredVariables: ["product_a", "product_b", "year"],
    builtIn: true,
    sections: [
      { id: "title", type: "title", heading: "{{product_a}} vs {{product_b}}: Which Is Better in {{year}}?", instructions: "Use as the article H1 title." },
      { id: "verdict", type: "tldr", heading: "{{product_a}} vs {{product_b}}: Quick Verdict", instructions: "Give readers the bottom line in 3-4 sentences: which product wins overall, who should choose {{product_a}}, and who should choose {{product_b}}. Be decisive.", minWords: 80, maxWords: 120, snippable: true },
      { id: "glance", type: "table", heading: "{{product_a}} vs {{product_b}} at a Glance", instructions: "Create a side-by-side comparison table showing pricing, key features, best for, pros, cons, and overall rating. Then briefly explain what the table shows.", minWords: 150, maxWords: 200, snippable: true },
      { id: "product-a", type: "text", heading: "What is {{product_a}}?", instructions: "Introduce {{product_a}}: what it is, who makes it, core functionality, target audience, and market position as of {{year}}.", minWords: 200, maxWords: 300 },
      { id: "product-b", type: "text", heading: "What is {{product_b}}?", instructions: "Introduce {{product_b}}: what it is, who makes it, core functionality, target audience, and market position as of {{year}}.", minWords: 200, maxWords: 300 },
      { id: "features", type: "text", heading: "Feature-by-Feature Comparison", instructions: "Compare {{product_a}} and {{product_b}} across the most important buying categories. For each category, explain which product wins and why.", minWords: 350, maxWords: 450 },
      { id: "pricing", type: "text", heading: "Pricing: {{product_a}} vs {{product_b}}", instructions: "Deep-dive into pricing for both products. Cover all pricing tiers, what's included in each, annual vs monthly pricing, free tier limitations, and total cost of ownership.", minWords: 200, maxWords: 300 },
      { id: "recommendation", type: "conclusion", heading: "Final Recommendation", instructions: "Summarize the decision. Recommend {{product_a}} for specific users and {{product_b}} for different users, then close with a confident next step.", minWords: 120, maxWords: 180 },
    ],
  },
  {
    id: "builtin-how-to",
    name: "How-To Guides",
    description: "Create step-by-step guides for repeatable tasks.",
    category: "How-To",
    titleTemplate: "How to {{task}}: Step-by-Step Guide ({{year}})",
    wordRange: [1050, 1450],
    requiredVariables: ["task", "year"],
    builtIn: true,
    sections: [
      { id: "title", type: "title", heading: "How to {{task}}: Step-by-Step Guide ({{year}})", instructions: "Use as the article H1 title." },
      { id: "quick-answer", type: "tldr", heading: "Quick Answer", instructions: "Provide a 2-3 sentence summary of how to {{task}} for readers who want the short version. Include the key steps at a high level.", minWords: 50, maxWords: 80, snippable: true },
      { id: "need", type: "text", heading: "What You'll Need", instructions: "List prerequisites clearly: tools, accounts, permissions, time required, and skill level. Be specific so readers know exactly what to have ready before starting.", minWords: 80, maxWords: 120 },
      { id: "steps", type: "how-to", heading: "How to {{task}}: Step-by-Step", instructions: "Deliver clear, numbered instructions for how to {{task}}. Each step should start with an action verb, include exactly what to click/enter/do, note expected results, and warn about common mistakes.", minWords: 500, maxWords: 700, snippable: true },
      { id: "tips", type: "text", heading: "Pro Tips for Better Results", instructions: "Share practical tips, shortcuts, quality checks, and common pitfalls that help readers get a better result when they {{task}}.", minWords: 150, maxWords: 220 },
      { id: "conclusion", type: "conclusion", heading: "Next Steps", instructions: "Summarize the process and tell readers what to do next after completing {{task}}. Keep it concise and action-oriented.", minWords: 100, maxWords: 150 },
    ],
  },
];

export function extractVariables(value: string) {
  const found: string[] = [];
  value.replace(variablePattern, (_match, name: string) => {
    if (!found.includes(name)) found.push(name);
    return "";
  });
  return found;
}

export function templateVariables(template: ProgrammaticTemplate) {
  const values = [
    ...template.requiredVariables,
    ...extractVariables(template.titleTemplate),
    ...template.sections.flatMap((section) => [
      ...extractVariables(section.heading),
      ...extractVariables(section.instructions),
    ]),
  ];
  return Array.from(new Set(values.filter(Boolean)));
}

export function renderTemplateText(value: string, row: ProgrammaticRow) {
  return value.replace(variablePattern, (_match, name: string) => row[name] ?? "");
}

export function renderProgrammaticArticle(template: ProgrammaticTemplate, row: ProgrammaticRow) {
  const title = renderTemplateText(template.titleTemplate, row);
  const sections = template.sections.map((section) => ({
    ...section,
    heading: renderTemplateText(section.heading, row),
    instructions: renderTemplateText(section.instructions, row),
  }));
  return {
    title,
    variables: row,
    sections,
    outline: sections
      .filter((section) => section.type !== "title" && section.heading)
      .map((section) => ({ level: 2 as const, text: section.heading })),
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
    rows = rows.flatMap((row) => list.map((value) => ({ ...row, [key]: value })));
    if (rows.length > maxRows) throw new Error(`Programmatic campaigns support up to ${maxRows} rows`);
  }
  return rows;
}

export function normalizeTemplate(value: unknown): ProgrammaticTemplate {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const sections = Array.isArray(raw.sections) ? raw.sections : [];
  const normalizedSections = sections.map((section, index) => {
    const record = section && typeof section === "object" ? section as Record<string, unknown> : {};
    const minWords = Number(record.minWords);
    const maxWords = Number(record.maxWords);
    return {
      id: String(record.id || `section-${index + 1}`),
      type: String(record.type || (index === 0 ? "title" : "text")),
      heading: String(record.heading || ""),
      instructions: String(record.instructions || ""),
      ...(Number.isFinite(minWords) && minWords > 0 ? { minWords } : {}),
      ...(Number.isFinite(maxWords) && maxWords > 0 ? { maxWords } : {}),
      snippable: Boolean(record.snippable),
      required: Boolean(record.required),
    };
  });
  const titleTemplate = String(raw.titleTemplate || normalizedSections.find((section) => section.type === "title")?.heading || "").trim();
  const requiredVariables = Array.isArray(raw.requiredVariables) ? raw.requiredVariables.map(String).filter(Boolean) : [];
  const min = normalizedSections.reduce((sum, section) => sum + (section.minWords || 0), 0);
  const max = normalizedSections.reduce((sum, section) => sum + (section.maxWords || section.minWords || 0), 0);
  const wordRange = Array.isArray(raw.wordRange) && raw.wordRange.length >= 2
    ? [Number(raw.wordRange[0]) || min, Number(raw.wordRange[1]) || max] as [number, number]
    : [min, max] as [number, number];
  const template: ProgrammaticTemplate = {
    id: String(raw.id || "custom"),
    name: String(raw.name || "Untitled template").trim(),
    description: String(raw.description || "").trim(),
    category: String(raw.category || "Custom").trim(),
    titleTemplate,
    wordRange,
    requiredVariables,
    sections: normalizedSections,
    builtIn: Boolean(raw.builtIn),
  };
  template.requiredVariables = templateVariables(template);
  return template;
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

export function materializeProgrammaticItems(payload: ProgrammaticCampaignPayload, maxRows = MAX_PROGRAMMATIC_ROWS) {
  if (!payload || typeof payload !== "object") throw new Error("Programmatic payload is required");
  const template = normalizeTemplate(payload.template);
  if (!template.titleTemplate) throw new Error("Template title is required");
  if (!template.sections.length) throw new Error("Add at least one template section");

  const dataMode: ProgrammaticDataMode = payload.dataMode === "all_combinations" ? "all_combinations" : "match_rows";
  const rows = dataMode === "all_combinations"
    ? buildCombinations(payload.variableValues || {}, maxRows)
    : (Array.isArray(payload.rows) ? payload.rows : []).map((row) => sanitizeRow(row));
  if (!rows.length) throw new Error("Add at least one data row");
  if (rows.length > maxRows) throw new Error(`Programmatic campaigns support up to ${maxRows} rows`);

  const variables = templateVariables(template);
  rows.forEach((row, index) => {
    const missing = variables.filter((variable) => !String(row[variable] || "").trim());
    if (missing.length) throw new Error(`Row ${index + 1} is missing: ${missing.join(", ")}`);
  });

  const items: ParsedCampaignItem[] = rows.map((row) => {
    const rendered = renderProgrammaticArticle(template, row);
    return {
      input: rendered.title,
      title: rendered.title,
      outline: rendered.outline,
      variables: row,
    };
  });

  return { template, dataMode, variables, rows, items };
}

function sanitizeRow(row: unknown): ProgrammaticRow {
  const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, String(value ?? "").trim()]));
}

if (import.meta.main) {
  const local = BUILT_IN_PROGRAMMATIC_TEMPLATES[0];
  assert.deepEqual(templateVariables(local), ["service", "city", "state", "year"]);
  assert.equal(renderTemplateText("Best {{service}} in {{city}}", { service: "Plumbers", city: "Austin" }), "Best Plumbers in Austin");
  assert.equal(parseCsv("city,state\nAustin,Texas").rows[0].city, "Austin");
  assert.equal(buildCombinations({ city: ["Austin", "Denver"], service: ["Plumbers"] }).length, 2);
  assert.equal(materializeProgrammaticItems({ template: local, rows: [{ service: "Plumbers", city: "Austin", state: "Texas", year: "2026" }] }).items[0].title, "Best Plumbers in Austin, Texas | 2026 Guide");
  assert.ok(scoreProgrammaticTemplate(local).score > 50);
  console.log("programmatic self-test ok");
}
