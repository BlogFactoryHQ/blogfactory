#!/usr/bin/env node
/**
 * Design-token gate.
 *
 * The app has a complete semantic token set (--primary, --accent, --status-*,
 * --muted, --border). Raw Tailwind palette utilities bypass it, so status colour
 * drifts per page and no theme change can ever be made in one place.
 *
 * This script fails when a raw palette utility appears outside
 * `src/components/ui/` (the shadcn primitives, which own their own variants).
 *
 * Usage: node scripts/lint-colors.mjs [--warn]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const webRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const srcRoot = join(webRoot, "src");

const PALETTES = [
  "slate", "gray", "zinc", "neutral", "stone",
  "red", "orange", "amber", "yellow", "lime", "green", "emerald", "teal",
  "cyan", "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
];
const PREFIXES = ["text", "bg", "border", "ring", "fill", "stroke", "from", "via", "to", "decoration", "outline", "shadow", "divide", "accent", "caret", "placeholder"];

const PATTERN = new RegExp(
  `\\b(?:${PREFIXES.join("|")})-(?:${PALETTES.join("|")})-\\d{2,3}\\b`,
  "g",
);

// Files allowed to reference raw palettes: the shadcn primitives own their variants.
const ALLOWED = [join("src", "components", "ui") + "/"];

const SUGGESTIONS = [
  ["emerald", "status-success"],
  ["green", "status-success"],
  ["teal", "status-success"],
  ["amber", "status-warning"],
  ["yellow", "status-warning"],
  ["red", "status-error"],
  ["rose", "status-error"],
  ["orange", "primary (action) or status-warning"],
  ["blue", "byword-blue / accent, or status-running"],
  ["sky", "byword-blue / accent"],
  ["indigo", "byword-blue / accent"],
  ["slate", "muted-foreground / border / status-pending"],
  ["gray", "muted-foreground / border"],
  ["zinc", "muted-foreground / border"],
  ["neutral", "muted-foreground / border"],
  ["stone", "muted-foreground / border"],
];

function suggestionFor(match) {
  const entry = SUGGESTIONS.find(([palette]) => match.includes(`-${palette}-`));
  return entry ? entry[1] : "a semantic token";
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (/\.(tsx|ts|css)$/.test(entry) && !/\.test\.(tsx|ts)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const warnOnly = process.argv.includes("--warn");
const findings = [];

for (const file of walk(srcRoot)) {
  const rel = relative(webRoot, file);
  if (ALLOWED.some((allowed) => rel.startsWith(allowed))) continue;
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const matches = line.match(PATTERN);
    if (!matches) return;
    for (const match of new Set(matches)) {
      findings.push({ file: rel, line: index + 1, match });
    }
  });
}

if (!findings.length) {
  console.log("design tokens: no raw palette utilities outside src/components/ui. ✔");
  process.exit(0);
}

const byFile = new Map();
for (const finding of findings) {
  if (!byFile.has(finding.file)) byFile.set(finding.file, []);
  byFile.get(finding.file).push(finding);
}

console.log(`design tokens: ${findings.length} raw palette utilit${findings.length === 1 ? "y" : "ies"} in ${byFile.size} file(s)\n`);
for (const [file, items] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${file} (${items.length})`);
  for (const item of items) {
    console.log(`    ${item.line}: ${item.match}  ->  use ${suggestionFor(item.match)}`);
  }
}
console.log("\nSee docs/frontend-ui-system-plan-2026-09-21.md §9 for the colour rules.");

process.exit(warnOnly ? 0 : 1);
