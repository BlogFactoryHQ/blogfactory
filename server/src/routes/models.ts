import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";
import { getOpenRouterModels } from "../services/openrouter-models.js";

export const modelsRoutes = new Hono();

const officialImageModels = [
  {
    id: "openrouter/free",
    name: "OpenRouter Free Router",
    provider: "openrouter",
    pricing: "free",
    costInfo: "Free via OpenRouter. Availability and rate limits are controlled by OpenRouter.",
    description: "Routes to an available free OpenRouter model. Stock fallback handles rate-limit or provider failures.",
    apiProvider: "openrouter",
    isFree: true,
    limits: "Free model availability may be rate-limited by OpenRouter.",
    constraints: {
      resolutions: ["Web", "1K"],
      aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
      maxDimensionPx: 1024,
    },
    rawPricing: { prompt: 0, completion: 0, image: 0, request: 0 },
    contextLength: null,
    modalities: { input: ["text"], output: ["image"] },
    created: null,
    supportedParameters: [],
  },
] as const;

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
  const baseModels = [...officialImageModels];
  if (!apiKey) return c.json(baseModels);

  try {
    const liveModels = await getOpenRouterModels(apiKey, "image", refresh);
    return c.json([...baseModels, ...liveModels.filter((model: { id: string }) => !baseModels.some((base) => base.id === model.id))]);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
