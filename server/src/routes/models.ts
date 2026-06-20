import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";

export const modelsRoutes = new Hono();

// In-memory cache with 1-hour TTL
let textModelsCache: { data: any; ts: number } | null = null;
let imageModelsCache: { data: any; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

modelsRoutes.get("/text", async (c) => {
  const refresh = c.req.query("refresh") === "true";
  const apiKey = await getOpenRouterKey(getUserId(c));
  if (!apiKey) return c.json({ error: "Add your OpenRouter API key in Settings to load live models" }, 400);

  if (!refresh && textModelsCache && Date.now() - textModelsCache.ts < CACHE_TTL) {
    return c.json(textModelsCache.data);
  }

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await resp.json();

    const models = (data.data || [])
      .filter((m: any) => !m.id.includes("image") && !m.id.includes("vision"))
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0],
        contextLength: m.context_length,
        pricing: {
          prompt: m.pricing?.prompt,
          completion: m.pricing?.completion,
        },
      }));

    textModelsCache = { data: models, ts: Date.now() };
    return c.json(models);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

modelsRoutes.get("/image", async (c) => {
  const refresh = c.req.query("refresh") === "true";
  const apiKey = await getOpenRouterKey(getUserId(c));
  if (!apiKey) return c.json({ error: "Add your OpenRouter API key in Settings to load live image models" }, 400);

  if (!refresh && imageModelsCache && Date.now() - imageModelsCache.ts < CACHE_TTL) {
    return c.json(imageModelsCache.data);
  }

  try {
    const resp = await fetch("https://openrouter.ai/api/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await resp.json();

    const imageModels = (data.data || [])
      .filter(
        (m: any) =>
          m.id.includes("image") ||
          m.architecture?.output_modalities?.includes("image")
      )
      .map((m: any) => ({
        id: m.id,
        name: m.name,
        provider: m.id.split("/")[0],
        pricing: {
          prompt: m.pricing?.prompt,
          completion: m.pricing?.completion,
        },
        contextLength: m.context_length,
      }));

    imageModelsCache = { data: imageModels, ts: Date.now() };
    return c.json(imageModels);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
