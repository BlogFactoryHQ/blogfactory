import { Hono } from "hono";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";

export const modelsRoutes = new Hono();

// In-memory cache with 1-hour TTL
let textModelsCache: { data: any; ts: number } | null = null;
let imageModelsCache: { data: any; ts: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

function dollarsPerMillion(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed * 1_000_000;
}

function classifyPricing(input: number, output: number, image = 0, request = 0): "free" | "low" | "medium" | "high" {
  const maxTokenCost = Math.max(input, output);
  if (maxTokenCost === 0 && image === 0 && request === 0) return "free";
  if (maxTokenCost <= 1 && image <= 0.05 && request <= 0.01) return "low";
  if (maxTokenCost <= 10 && image <= 0.25 && request <= 0.05) return "medium";
  return "high";
}

function formatMoney(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1) return `$${value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "")}`;
  return `$${value.toFixed(2).replace(/\.00$/, "")}`;
}

function formatTokenCost(input: number, output: number): string {
  if (input === 0 && output === 0) return "Free";
  return `${formatMoney(input)} in / ${formatMoney(output)} out per 1M tokens`;
}

function modelDescription(model: any): string {
  const description = model.description || model.architecture?.modality || "";
  return typeof description === "string" ? description : "";
}

function normalizeModel(model: any, kind: "text" | "image") {
  const prompt = dollarsPerMillion(model.pricing?.prompt);
  const completion = dollarsPerMillion(model.pricing?.completion);
  const image = Number(model.pricing?.image ?? 0);
  const request = Number(model.pricing?.request ?? 0);
  const pricing = classifyPricing(prompt, completion, image, request);
  const modalities = {
    input: model.architecture?.input_modalities || [],
    output: model.architecture?.output_modalities || [],
  };

  return {
    id: model.id,
    name: model.name || model.id,
    provider: String(model.id || "").split("/")[0] || "openrouter",
    pricing,
    costInfo: kind === "image" && image > 0
      ? `${formatTokenCost(prompt, completion)} · ${formatMoney(image)} per image`
      : formatTokenCost(prompt, completion),
    description: modelDescription(model),
    isFree: pricing === "free",
    limits: pricing === "free" ? "Free model availability may be rate-limited by OpenRouter" : null,
    rawPricing: {
      prompt,
      completion,
      image,
      request,
    },
    contextLength: model.context_length ?? null,
    modalities,
    created: model.created ?? null,
    supportedParameters: model.supported_parameters || [],
  };
}

modelsRoutes.get("/text", async (c) => {
  const refresh = c.req.query("refresh") === "true";
  const apiKey = await getOpenRouterKey(getUserId(c));
  if (!apiKey) return c.json({ error: "Add your OpenRouter API key in Settings to load live models" }, 400);

  if (!refresh && textModelsCache && Date.now() - textModelsCache.ts < CACHE_TTL) {
    return c.json(textModelsCache.data);
  }

  try {
    const resp = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return c.json({ error: `OpenRouter model refresh failed (${resp.status})` }, resp.status as any);
    const data = await resp.json();

    const models = (data.data || [])
      .filter((m: any) => !m.architecture?.output_modalities?.includes("image") && !String(m.id).includes("image"))
      .map((m: any) => normalizeModel(m, "text"))
      .sort((a: any, b: any) => {
        if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
        return (a.rawPricing.prompt + a.rawPricing.completion) - (b.rawPricing.prompt + b.rawPricing.completion);
      });

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
    const resp = await fetch(OPENROUTER_MODELS_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!resp.ok) return c.json({ error: `OpenRouter model refresh failed (${resp.status})` }, resp.status as any);
    const data = await resp.json();

    const imageModels = (data.data || [])
      .filter(
        (m: any) =>
          m.id.includes("image") ||
          m.architecture?.output_modalities?.includes("image")
      )
      .map((m: any) => ({
        ...normalizeModel(m, "image"),
        apiProvider: "openrouter",
        constraints: null,
      }))
      .sort((a: any, b: any) => {
        if (a.isFree !== b.isFree) return a.isFree ? -1 : 1;
        return (a.rawPricing.prompt + a.rawPricing.completion + a.rawPricing.image) -
          (b.rawPricing.prompt + b.rawPricing.completion + b.rawPricing.image);
      });

    imageModelsCache = { data: imageModels, ts: Date.now() };
    return c.json(imageModels);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});
