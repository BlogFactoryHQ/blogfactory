import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";
import { getOpenRouterModels } from "../services/openrouter-models.js";

export const modelsRoutes = new Hono();

const manualImageModels = [
  {
    id: "manual/midjourney-relax",
    name: "Midjourney Relax (manual)",
    provider: "manual",
    pricing: "free",
    costInfo: "Uses your subscription manually",
    description: "Creates copy-ready prompts for Midjourney; upload the finished image back into the gallery.",
    apiProvider: "manual",
    isFree: true,
    limits: "Human-operated queue. No Midjourney API or Discord automation.",
    constraints: null,
    rawPricing: { prompt: 0, completion: 0, image: 0, request: 0 },
    contextLength: null,
    modalities: { input: ["text"], output: ["image"] },
    created: null,
    supportedParameters: [],
  },
  {
    id: "manual/higgsfield-web",
    name: "Higgsfield Web (manual)",
    provider: "manual",
    pricing: "free",
    costInfo: "Uses your subscription manually",
    description: "Creates copy-ready prompts for Higgsfield web; upload the finished image back into the gallery.",
    apiProvider: "manual",
    isFree: true,
    limits: "Human-operated queue. Does not bypass Higgsfield credits or API limits.",
    constraints: null,
    rawPricing: { prompt: 0, completion: 0, image: 0, request: 0 },
    contextLength: null,
    modalities: { input: ["text"], output: ["image"] },
    created: null,
    supportedParameters: [],
  },
  {
    id: "manual/chatgpt-images",
    name: "ChatGPT Images (manual)",
    provider: "manual",
    pricing: "free",
    costInfo: "Uses your subscription manually",
    description: "Creates copy-ready prompts for ChatGPT image generation; upload the finished image back into the gallery.",
    apiProvider: "manual",
    isFree: true,
    limits: "Human-operated queue. Does not turn ChatGPT or Codex subscription usage into API usage.",
    constraints: null,
    rawPricing: { prompt: 0, completion: 0, image: 0, request: 0 },
    contextLength: null,
    modalities: { input: ["text"], output: ["image"] },
    created: null,
    supportedParameters: [],
  },
] as const;

const officialImageModels = [
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
    costInfo: "Billed by Google Gemini API",
    description: "Google Gemini native image generation via Google AI Studio API.",
    apiProvider: "google-ai-studio",
    isFree: false,
    limits: null,
    constraints: null,
    rawPricing: { prompt: 0, completion: 0, image: 0, request: 0 },
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
    costInfo: "Billed by Google Gemini API",
    description: "Google Gemini professional image generation via Google AI Studio API.",
    apiProvider: "google-ai-studio",
    isFree: false,
    limits: null,
    constraints: null,
    rawPricing: { prompt: 0, completion: 0, image: 0, request: 0 },
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
  const baseModels = [...manualImageModels, ...officialImageModels];
  if (!apiKey) return c.json(baseModels);

  try {
    return c.json([...baseModels, ...await getOpenRouterModels(apiKey, "image", refresh)]);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
