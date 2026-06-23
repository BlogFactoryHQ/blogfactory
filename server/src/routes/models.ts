import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";
import { getOpenRouterModels } from "../services/openrouter-models.js";

export const modelsRoutes = new Hono();

const officialImageModels = [
  {
    id: "auto/consistent-cover",
    name: "Auto: Consistent Covers",
    provider: "auto",
    pricing: "low",
    costInfo: "Uses one stable provider: Google AI Studio, then OpenAI, then Replicate",
    description: "Best default for brand consistency. Avoids rotating through random free providers unless you explicitly pick them.",
    apiProvider: "auto",
    isFree: false,
    limits: "One-at-a-time queue; stock fallback handles provider failures.",
    constraints: {
      resolutions: ["Web", "1K"],
      aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
      maxDimensionPx: 1024,
    },
    rawPricing: { prompt: 0, completion: 0, image: 0.04, request: 0 },
    contextLength: null,
    modalities: { input: ["text"], output: ["image"] },
    created: null,
    supportedParameters: [],
  },
  {
    id: "auto/cost-effective",
    name: "Auto: Cheapest Available",
    provider: "auto",
    pricing: "low",
    costInfo: "Chooses Google AI Studio, OpenRouter free, then paid fallbacks",
    description: "Uses the cheapest available image provider from your saved API keys.",
    apiProvider: "auto",
    isFree: false,
    limits: "One-at-a-time queue; falls back to stock if AI fails.",
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
  {
    id: "openai/gpt-image-2",
    name: "GPT Image 2",
    provider: "openai",
    pricing: "medium",
    costInfo: "Billed by OpenAI Images API",
    description: "OpenAI's official image generation API model.",
    apiProvider: "openai",
    isFree: false,
    limits: null,
    constraints: {
      resolutions: ["1K", "2K"],
      aspectRatios: ["1:1", "2:3", "3:2"],
      maxDimensionPx: 1536,
    },
    rawPricing: { prompt: 0, completion: 0, image: 0, request: 0 },
    contextLength: null,
    modalities: { input: ["text", "image"], output: ["image"] },
    created: null,
    supportedParameters: ["size", "quality"],
  },
  {
    id: "google-ai-studio/gemini-3.1-flash-image",
    name: "Gemini 3.1 Flash Image",
    provider: "google-ai-studio",
    pricing: "low",
    costInfo: "$0.04 per image via Google Gemini API",
    description: "Google Gemini native image generation via Google AI Studio API.",
    apiProvider: "google-ai-studio",
    isFree: false,
    limits: null,
    constraints: {
      resolutions: ["1K"],
      aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
      maxDimensionPx: 1024,
    },
    rawPricing: { prompt: 0, completion: 0, image: 0.04, request: 0 },
    contextLength: null,
    modalities: { input: ["text", "image"], output: ["image"] },
    created: null,
    supportedParameters: [],
  },
  {
    id: "google-ai-studio/gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    provider: "google-ai-studio",
    pricing: "medium",
    costInfo: "$0.04 per image via Google Gemini API",
    description: "Google Gemini professional image generation via Google AI Studio API.",
    apiProvider: "google-ai-studio",
    isFree: false,
    limits: null,
    constraints: {
      resolutions: ["1K"],
      aspectRatios: ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
      maxDimensionPx: 1024,
    },
    rawPricing: { prompt: 0, completion: 0, image: 0.04, request: 0 },
    contextLength: null,
    modalities: { input: ["text", "image"], output: ["image"] },
    created: null,
    supportedParameters: [],
  },
  {
    id: "replicate/black-forest-labs/flux-schnell",
    name: "FLUX Schnell",
    provider: "replicate",
    pricing: "low",
    costInfo: "Billed by Replicate",
    description: "Fast FLUX image generation through Replicate's official API.",
    apiProvider: "replicate",
    isFree: false,
    limits: null,
    constraints: null,
    rawPricing: { prompt: 0, completion: 0, image: 0, request: 0 },
    contextLength: null,
    modalities: { input: ["text"], output: ["image"] },
    created: null,
    supportedParameters: ["aspect_ratio"],
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
    return c.json([...baseModels, ...await getOpenRouterModels(apiKey, "image", refresh)]);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
