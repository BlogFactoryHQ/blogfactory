import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { programmaticDatasets, programmaticTemplates } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import {
  BUILT_IN_PROGRAMMATIC_TEMPLATES,
  normalizeTemplate,
  parseCsv,
  type ProgrammaticRow,
} from "../services/programmatic.js";

export const programmaticRoutes = new Hono();

programmaticRoutes.get("/templates", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select()
    .from(programmaticTemplates)
    .where(eq(programmaticTemplates.userId, userId))
    .orderBy(desc(programmaticTemplates.createdAt));
  return c.json([...BUILT_IN_PROGRAMMATIC_TEMPLATES, ...rows.map(serializeTemplate)]);
});

programmaticRoutes.post("/templates", async (c) => {
  const userId = getUserId(c);
  const template = normalizeTemplate((await c.req.json()).template);
  if (!template.titleTemplate) return c.json({ error: "Template title is required" }, 400);
  if (!template.sections.length) return c.json({ error: "Add at least one section" }, 400);

  const [created] = await db.insert(programmaticTemplates).values({
    userId,
    name: template.name,
    description: template.description,
    category: template.category,
    template: { ...template, builtIn: false },
  }).returning();
  return c.json(serializeTemplate(created), 201);
});

programmaticRoutes.put("/templates/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const template = normalizeTemplate((await c.req.json()).template);
  const [updated] = await db
    .update(programmaticTemplates)
    .set({
      name: template.name,
      description: template.description,
      category: template.category,
      template: { ...template, id, builtIn: false },
    })
    .where(and(eq(programmaticTemplates.id, id), eq(programmaticTemplates.userId, userId)))
    .returning();
  if (!updated) return c.json({ error: "Template not found" }, 404);
  return c.json(serializeTemplate(updated));
});

programmaticRoutes.delete("/templates/:id", async (c) => {
  const userId = getUserId(c);
  const [deleted] = await db
    .delete(programmaticTemplates)
    .where(and(eq(programmaticTemplates.id, c.req.param("id")), eq(programmaticTemplates.userId, userId)))
    .returning({ id: programmaticTemplates.id });
  if (!deleted) return c.json({ error: "Template not found" }, 404);
  return c.json({ ok: true });
});

programmaticRoutes.get("/datasets", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select()
    .from(programmaticDatasets)
    .where(eq(programmaticDatasets.userId, userId))
    .orderBy(desc(programmaticDatasets.createdAt));
  return c.json(rows.map((row) => ({
    id: row.id,
    name: row.name,
    columns: row.columns,
    rows: row.rows,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  })));
});

programmaticRoutes.post("/datasets", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const name = String(body.name || "").trim();
  const rows = sanitizeRows(body.rows);
  const columns = sanitizeColumns(body.columns, rows);
  if (!name) return c.json({ error: "Dataset name is required" }, 400);
  if (!rows.length) return c.json({ error: "Add at least one row" }, 400);

  const [created] = await db.insert(programmaticDatasets).values({ userId, name, columns, rows }).returning();
  return c.json(created, 201);
});

programmaticRoutes.put("/datasets/:id", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const rows = sanitizeRows(body.rows);
  const columns = sanitizeColumns(body.columns, rows);
  const [updated] = await db
    .update(programmaticDatasets)
    .set({ name: String(body.name || "Untitled dataset").trim(), columns, rows })
    .where(and(eq(programmaticDatasets.id, c.req.param("id")), eq(programmaticDatasets.userId, userId)))
    .returning();
  if (!updated) return c.json({ error: "Dataset not found" }, 404);
  return c.json(updated);
});

programmaticRoutes.delete("/datasets/:id", async (c) => {
  const userId = getUserId(c);
  const [deleted] = await db
    .delete(programmaticDatasets)
    .where(and(eq(programmaticDatasets.id, c.req.param("id")), eq(programmaticDatasets.userId, userId)))
    .returning({ id: programmaticDatasets.id });
  if (!deleted) return c.json({ error: "Dataset not found" }, 404);
  return c.json({ ok: true });
});

programmaticRoutes.post("/import-csv-url", async (c) => {
  const { url } = await c.req.json();
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(String(url || ""));
  } catch {
    return c.json({ error: "Enter a valid CSV URL" }, 400);
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return c.json({ error: "CSV URL must use http or https" }, 400);
  }
  if (parsedUrl.username || parsedUrl.password || isPrivateCsvHost(parsedUrl.hostname)) {
    return c.json({ error: "CSV URL must be public" }, 400);
  }

  const response = await fetch(parsedUrl, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return c.json({ error: `CSV fetch failed: ${response.status}` }, 400);
  if (isPrivateCsvHost(new URL(response.url).hostname)) return c.json({ error: "CSV URL redirected to a private host" }, 400);
  const text = await response.text();
  if (text.length > 2_000_000) return c.json({ error: "CSV is too large" }, 400);
  return c.json(parseCsv(text));
});

function serializeTemplate(row: typeof programmaticTemplates.$inferSelect) {
  const template = normalizeTemplate(row.template);
  return {
    ...template,
    id: row.id,
    name: row.name,
    description: row.description || template.description,
    category: row.category || template.category,
    builtIn: false,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sanitizeRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const record = row && typeof row === "object" ? row as Record<string, unknown> : {};
    return Object.fromEntries(Object.entries(record).map(([key, cell]) => [key, String(cell ?? "").trim()]));
  }).filter((row) => Object.values(row).some(Boolean)) as ProgrammaticRow[];
}

function sanitizeColumns(value: unknown, rows: ProgrammaticRow[]) {
  const fromBody = Array.isArray(value) ? value.map(String).map((column) => column.trim()).filter(Boolean) : [];
  if (fromBody.length) return Array.from(new Set(fromBody));
  return Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function isPrivateCsvHost(value: string) {
  const host = value.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  const match = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const [a, b] = match.slice(1).map(Number);
  return a === 0
    || a === 10
    || a === 127
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || a >= 224;
}
