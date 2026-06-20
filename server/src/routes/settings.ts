import { Hono } from "hono";
import { db } from "../db/index.js";
import { userSettings } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { deleteApiKey, getApiKeyMetadata, setApiKey } from "../services/api-keys.js";

export const settingsRoutes = new Hono();

settingsRoutes.get("/api-keys", async (c) => {
  const userId = getUserId(c);
  return c.json(await getApiKeyMetadata(userId));
});

settingsRoutes.put("/api-keys", async (c) => {
  const userId = getUserId(c);
  const { provider, apiKey } = await c.req.json();

  if (provider !== "openrouter" && provider !== "google") {
    return c.json({ error: "Invalid provider" }, 400);
  }
  if (!apiKey || typeof apiKey !== "string") {
    return c.json({ error: "API key is required" }, 400);
  }

  try {
    return c.json(await setApiKey(userId, provider, apiKey));
  } catch (err: any) {
    return c.json({ error: err.message || "Failed to save API key" }, 400);
  }
});

settingsRoutes.delete("/api-keys", async (c) => {
  const userId = getUserId(c);
  const provider = c.req.query("provider");

  if (provider !== "openrouter" && provider !== "google") {
    return c.json({ error: "Invalid provider" }, 400);
  }

  return c.json(await deleteApiKey(userId, provider));
});

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
