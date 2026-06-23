import { strict as assert } from "node:assert";

export type CampaignMode = "keyword" | "title" | "title_outline" | "programmatic";
export type OutlineHeading = { level: 2 | 3; text: string };

export interface ParsedCampaignItem {
  input: string;
  keyword?: string;
  title?: string;
  outline?: OutlineHeading[];
  variables?: Record<string, string>;
}

const modes = new Set(["keyword", "title", "title_outline", "programmatic"]);

export function isCampaignMode(value: unknown): value is CampaignMode {
  return typeof value === "string" && modes.has(value);
}

export function normalizeOutline(value: unknown): OutlineHeading[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const text = typeof record.text === "string" ? record.text.trim() : "";
      if (!text) return null;
      return { level: Number(record.level) === 3 ? 3 : 2, text } as OutlineHeading;
    })
    .filter((item): item is OutlineHeading => Boolean(item));
}

function parseHeading(value: string): OutlineHeading {
  const trimmed = value.trim();
  if (/^h3\s*:/i.test(trimmed)) return { level: 3, text: trimmed.replace(/^h3\s*:/i, "").trim() };
  if (/^h2\s*:/i.test(trimmed)) return { level: 2, text: trimmed.replace(/^h2\s*:/i, "").trim() };
  return { level: 2, text: trimmed };
}

export function parseCampaignLines(lines: string, mode: CampaignMode, maxItems = 100): ParsedCampaignItem[] {
  const values = lines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (values.length > maxItems) throw new Error(`Campaigns support up to ${maxItems} items`);

  return values.map((input) => {
    if (mode === "keyword") return { input, keyword: input };
    if (mode === "title") return { input, title: input };

    const delimiter = input.includes("\t") ? "\t" : ";";
    const parts = input.split(delimiter).map((part) => part.trim()).filter(Boolean);
    const title = parts[0] || input;
    const outline = parts.slice(1).map(parseHeading).filter((heading) => heading.text);
    return { input, title, outline: outline.length ? outline : undefined };
  });
}

if (import.meta.main) {
  assert.equal(parseCampaignLines("crm software", "keyword")[0].keyword, "crm software");
  assert.equal(parseCampaignLines("Best CRM", "title")[0].title, "Best CRM");
  assert.equal(parseCampaignLines("Best CRM; Intro; H3:Pricing", "title_outline")[0].outline?.[1].level, 3);
}
