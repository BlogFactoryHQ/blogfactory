import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";
import { getOpenRouterModels } from "../services/openrouter-models.js";

export const modelsRoutes = new Hono();

modelsRoutes.get("/text", async (c) => {
  const refresh = c.req.query("refresh") === "true";
  const apiKey = await getOpenRouterKey(getUserId(c));
  if (!apiKey) return c.json({ error: "Add your OpenRouter API key in Settings to load live models" }, 400);

  try {
    return c.json(await getOpenRouterModels(apiKey, "text", refresh));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

modelsRoutes.get("/image", async (c) => {
  const refresh = c.req.query("refresh") === "true";
  const apiKey = await getOpenRouterKey(getUserId(c));
  if (!apiKey) return c.json([]);

  try {
    return c.json(await getOpenRouterModels(apiKey, "image", refresh));
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
