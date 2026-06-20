import { Hono } from "hono";

export const modelsRoutes = new Hono();

// In-memory cache with 1-hour TTL
let textModelsCache: { data: any; ts: number } | null = null;
let imageModelsCache: { data: any; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

modelsRoutes.get("/text", async (c) => {
  const refresh = c.req.query("refresh") === "true";

  if (!refresh && textModelsCache && Date.now() - textModelsCache.ts < CACHE_TTL) {
    return c.json(textModelsCache.data);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return c.json({ error: "OpenRouter API key not configured" }, 500);

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

  if (!refresh && imageModelsCache && Date.now() - imageModelsCache.ts < CACHE_TTL) {
    return c.json(imageModelsCache.data);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return c.json({ error: "OpenRouter API key not configured" }, 500);

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
