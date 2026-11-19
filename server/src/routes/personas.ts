import { Hono } from "hono";
import { db } from "../db/index.js";
import { personas } from "../db/schema.js";
import { eq, and } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { readJsonObject, requiredString } from "../http/error-contract.js";

export const personasRoutes = new Hono();

const FIELD_MAP: Record<string, string> = {
  base_model: "baseModel",
  system_prompt: "systemPrompt",
  response_format: "responseFormat",
  response_schema: "responseSchema",
  tools_config: "toolsConfig",
  parallel_tool_calls: "parallelToolCalls",
  tool_choice: "toolChoice",
  plugins_config: "pluginsConfig",
  validation_rules: "validationRules",
};

const REVERSE_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(FIELD_MAP).map(([k, v]) => [v, k])
);

/** Map snake_case keys from frontend to camelCase for Drizzle ORM */
function mapPersonaBody(body: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    mapped[FIELD_MAP[k] ?? k] = v;
  }
  return mapped;
}

/** Map camelCase keys from Drizzle to snake_case for frontend */
function mapPersonaResponse(row: Record<string, unknown>) {
  const mapped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    mapped[REVERSE_MAP[k] ?? k] = v;
  }
  return mapped;
}

personasRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select()
    .from(personas)
    .where(eq(personas.userId, userId))
    .orderBy(personas.name);
  return c.json(rows.map((r) => mapPersonaResponse(r as Record<string, unknown>)));
});

personasRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  const rawBody = await readJsonObject(c);
  requiredString(rawBody, "name");
  const body = mapPersonaBody(rawBody);
  const [persona] = await db
    .insert(personas)
    .values({ ...body, userId } as any)
    .returning();
  return c.json(mapPersonaResponse(persona as Record<string, unknown>), 201);
});

personasRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = mapPersonaBody(await readJsonObject(c));

  const [updated] = await db
    .update(personas)
    .set(body)
    .where(and(eq(personas.id, id), eq(personas.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: "Persona not found" }, 404);
  return c.json(mapPersonaResponse(updated as Record<string, unknown>));
});

personasRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(personas)
    .where(and(eq(personas.id, id), eq(personas.userId, userId)))
    .returning({ id: personas.id });

  if (!deleted) return c.json({ error: "Persona not found" }, 404);
  return c.json({ success: true });
});

personasRoutes.post("/:id/duplicate", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [original] = await db
    .select()
    .from(personas)
    .where(and(eq(personas.id, id), eq(personas.userId, userId)))
    .limit(1);

  if (!original) return c.json({ error: "Persona not found" }, 404);

  const { id: _, createdAt, updatedAt, ...rest } = original;
  const [dup] = await db
    .insert(personas)
    .values({ ...rest, name: `${original.name} (Copy)` })
    .returning();

  return c.json(mapPersonaResponse(dup as Record<string, unknown>), 201);
});

personasRoutes.post("/:id/test", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const testBody = await readJsonObject(c);
  const prompt = requiredString(testBody, "prompt");
  const sourceUrl = typeof testBody.sourceUrl === "string" ? testBody.sourceUrl : undefined;

  // Delegate to test-persona service
  const { testPersona } = await import("../services/test-persona.js");
  const result = await testPersona({ personaId: id, userId, prompt, sourceUrl });
  return c.json(result);
});
