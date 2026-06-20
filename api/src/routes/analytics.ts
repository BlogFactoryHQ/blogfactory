import { Hono } from "hono";
import { db } from "../db/index.js";
import { generationLogs } from "../db/schema.js";
import { eq, and, gte, lte } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";

export const analyticsRoutes = new Hono();

analyticsRoutes.get("/usage", async (c) => {
  const userId = getUserId(c);
  const from = c.req.query("from");
  const to = c.req.query("to");

  let query = db
    .select()
    .from(generationLogs)
    .where(eq(generationLogs.userId, userId));

  // Build conditions array for additional filters
  const conditions = [eq(generationLogs.userId, userId)];
  if (from) conditions.push(gte(generationLogs.createdAt, new Date(from)));
  if (to) conditions.push(lte(generationLogs.createdAt, new Date(to)));

  const rows = await db
    .select()
    .from(generationLogs)
    .where(and(...conditions))
    .orderBy(generationLogs.createdAt);

  return c.json(rows);
});

analyticsRoutes.get("/openrouter-usage", async (c) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return c.json({ error: "OpenRouter API key not configured" }, 500);

  try {
    const [keyResp, creditsResp] = await Promise.all([
      fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      fetch("https://openrouter.ai/api/v1/credits", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    ]);

    const keyData = await keyResp.json();
    const creditsData = await creditsResp.json();

    return c.json({ usage: keyData, credits: creditsData });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
