import { Hono } from "hono";
import { db } from "../db/index.js";
import { userSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";

export const settingsRoutes = new Hono();

settingsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const [settings] = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  return c.json(settings || {});
});

settingsRoutes.put("/", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();

  // Upsert: insert or update on conflict
  const [result] = await db
    .insert(userSettings)
    .values({ ...body, userId })
    .onConflictDoUpdate({
      target: userSettings.userId,
      set: body,
    })
    .returning();

  return c.json(result);
});
