const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OPENROUTER_IMAGE_MODELS_URL = "https://openrouter.ai/api/v1/images/models";
const CACHE_TTL = 60 * 60 * 1000;
const MODEL_FETCH_TIMEOUT_MS = 10_000;

export const OPENROUTER_MODEL_UNAVAILABLE_MESSAGE =
  "Selected model is no longer available on OpenRouter. Pick a live model in settings/persona/feed.";
export const OPENROUTER_IMAGE_MODEL_ID = "x-ai/grok-imagine-image-quality";
const OPENROUTER_IMAGE_MODEL_RESOLUTIONS: Record<string, string[]> = {
  "google/gemini-3.1-flash-image": ["512", "1K"],
  "google/gemini-3-pro-image": ["1K"],
  [OPENROUTER_IMAGE_MODEL_ID]: ["1K"],
  "google/gemini-3.1-flash-image-preview": ["512", "1K"],
};
const OPENROUTER_IMAGE_MODEL_IDS = new Set(Object.keys(OPENROUTER_IMAGE_MODEL_RESOLUTIONS));

type ModelKind = "text" | "image";
type NormalizedOpenRouterModel = ReturnType<typeof normalizeOpenRouterModel>;

let modelsCache: Record<ModelKind, { data: NormalizedOpenRouterModel[]; ts: number } | null> = {
  text: null,
  image: null,
};

function dollarsPerMillion(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed * 1_000_000;
}

function hasDynamicPricing(pricing: any) {
  return ["prompt", "completion", "image", "request"].some((key) => Number(pricing?.[key]) < 0);
}

function nonNegativeNumber(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function endpointImagePricing(model: any) {
  const prices: Record<string, number> = {};
  const tokenPrices: string[] = [];
  for (const endpoint of model.image_endpoints || []) {
    for (const line of endpoint.pricing || []) {
      if (line.billable !== "output_image") continue;
      if (line.unit === "image") {
        const key = String(line.variant || "default").toUpperCase();
        const cost = nonNegativeNumber(line.cost_usd);
        if (cost && (!prices[key] || cost < prices[key])) prices[key] = cost;
      } else if (line.unit === "token") {
        tokenPrices.push(`${formatMoney(nonNegativeNumber(line.cost_usd))} per output token`);
      }
    }
  }
  return { prices, tokenPrices: [...new Set(tokenPrices)] };
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

function enumValues(value: any) {
  return value?.type === "enum" && Array.isArray(value.values) ? value.values.map(String) : [];
}

function imageResolutions(model: any) {
  const resolutions = enumValues(model.supported_parameters?.resolution);
  return (OPENROUTER_IMAGE_MODEL_RESOLUTIONS[model.id] || []).filter((resolution) => resolutions.includes(resolution));
}

export function normalizeOpenRouterImageModelId(modelId: string | null | undefined) {
  const value = modelId?.trim();
  return value && OPENROUTER_IMAGE_MODEL_IDS.has(value) ? value : "";
}

export function openRouterImageResolution(modelId: string, resolution: string | null | undefined) {
  const allowed = OPENROUTER_IMAGE_MODEL_RESOLUTIONS[modelId] || ["1K"];
  const value = resolution?.trim();
  return value && allowed.includes(value) ? value : allowed.includes("1K") ? "1K" : allowed[0];
}

function supportsApprovedImage(model: any) {
  const aspectRatios = enumValues(model.supported_parameters?.aspect_ratio);
  return Boolean(normalizeOpenRouterImageModelId(model.id))
    && imageResolutions(model).length > 0
    && ["16:9", "3:2"].every((ratio) => aspectRatios.includes(ratio));
}

function openRouterImageConstraints(model: any) {
  const params = model.supported_parameters || {};
  const aspectRatios = enumValues(params.aspect_ratio).filter((value: string) => value !== "auto");
  const resolutions = imageResolutions(model);
  return {
    resolutions: resolutions.length ? resolutions : ["1K"],
    aspectRatios: aspectRatios.length ? aspectRatios : ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
    maxDimensionPx: 1024,
  };
}

function modelDescription(model: any): string {
  const description = model.description || model.architecture?.modality || "";
  return typeof description === "string" ? description : "";
}

export function normalizeOpenRouterModel(model: any, kind: ModelKind) {
  const dynamicPricing = hasDynamicPricing(model.pricing);
  const prompt = dollarsPerMillion(model.pricing?.prompt);
  const completion = dollarsPerMillion(model.pricing?.completion);
  const endpointPricing = kind === "image" ? endpointImagePricing(model) : { prices: {}, tokenPrices: [] };
  const imageByResolution = {
    "512": endpointPricing.prices["512"] || 0,
    "1K": endpointPricing.prices["1K"] || nonNegativeNumber(model.pricing?.image),
  };
  const image = imageByResolution["1K"] || imageByResolution["512"] || nonNegativeNumber(model.pricing?.image);
  const request = nonNegativeNumber(model.pricing?.request);
  const webSearch = nonNegativeNumber(model.pricing?.web_search);
  const pricing = dynamicPricing ? "medium" : classifyPricing(prompt, completion, image, request);
  const tokenCost = dynamicPricing ? "Dynamic pricing" : formatTokenCost(prompt, completion);

  return {
    id: model.id,
    name: model.name || model.id,
    provider: String(model.id || "").split("/")[0] || "openrouter",
    pricing,
    costInfo: [
      kind === "image" && image > 0 ? `${tokenCost} · ${formatMoney(image)} per image` : tokenCost,
      kind === "image" && endpointPricing.tokenPrices.length ? endpointPricing.tokenPrices.join(" · ") : "",
      webSearch > 0 ? `${formatMoney(webSearch)} web search` : "",
    ].filter(Boolean).join(" · "),
    description: modelDescription(model),
    isFree: !dynamicPricing && pricing === "free",
    limits: dynamicPricing ? "Price depends on the routed model" : pricing === "free" ? "Free model availability may be rate-limited by OpenRouter" : null,
    rawPricing: { prompt, completion, image, request, webSearch, imageByResolution },
    contextLength: model.context_length ?? null,
    modalities: {
      input: model.architecture?.input_modalities || [],
      output: model.architecture?.output_modalities || [],
    },
    created: model.created ?? null,
    supportedParameters: Array.isArray(model.supported_parameters)
      ? model.supported_parameters
      : Object.keys(model.supported_parameters || {}),
    ...(kind === "image" ? { apiProvider: "openrouter", constraints: openRouterImageConstraints(model) } : {}),
  };
}

export function catalogFromOpenRouterPayload(data: any, kind: ModelKind) {
  return (data.data || [])
    .filter((model: any) => model.architecture?.output_modalities?.includes(kind))
    .filter((model: any) => kind !== "image" || supportsApprovedImage(model))
    .map((model: any) => normalizeOpenRouterModel(model, kind));
}

function mergeModelDetails(primary: any, pricing?: any) {
  return {
    ...pricing,
    ...primary,
    pricing: pricing?.pricing || primary.pricing,
    context_length: pricing?.context_length ?? primary.context_length,
    architecture: primary.architecture || pricing?.architecture,
  };
}

async function fetchOpenRouterJson(url: URL | string, apiKey: string) {
  const resp = await fetch(url, {
    signal: AbortSignal.timeout(MODEL_FETCH_TIMEOUT_MS),
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!resp.ok) throw new Error(`OpenRouter model refresh failed (${resp.status})`);
  return resp.json();
}

async function getOpenRouterImageModels(apiKey: string) {
  const pricingPayload = await fetchOpenRouterJson(`${OPENROUTER_MODELS_URL}?output_modalities=image&sort=most-popular`, apiKey);
  let imagePayload;
  try {
    imagePayload = await fetchOpenRouterJson(OPENROUTER_IMAGE_MODELS_URL, apiKey);
  } catch {
    return pricingPayload;
  }
  const pricingById = new Map((pricingPayload.data || []).map((model: any) => [model.id, model]));
  const endpointById = new Map();
  await Promise.all((imagePayload.data || [])
    .filter((model: any) => normalizeOpenRouterImageModelId(model.id))
    .map(async (model: any) => {
      try {
        const endpointPayload = await fetchOpenRouterJson(`https://openrouter.ai${model.endpoints}`, apiKey);
        endpointById.set(model.id, endpointPayload.endpoints || []);
      } catch {
        endpointById.set(model.id, []);
      }
    }));
  return {
    data: (imagePayload.data || []).map((model: any) => ({
      ...mergeModelDetails(model, pricingById.get(model.id)),
      image_endpoints: endpointById.get(model.id) || [],
    })),
  };
}

export async function getOpenRouterModels(apiKey: string, kind: ModelKind, refresh = false) {
  const cached = modelsCache[kind];
  if (!refresh && cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const url = new URL(OPENROUTER_MODELS_URL);
  url.searchParams.set("output_modalities", kind);
  url.searchParams.set("sort", kind === "text" ? "pricing-low-to-high" : "most-popular");
  const payload = kind === "image"
    ? await getOpenRouterImageModels(apiKey)
    : await fetchOpenRouterJson(url, apiKey);
  const models = catalogFromOpenRouterPayload(payload, kind);
  modelsCache[kind] = { data: models, ts: Date.now() };
  return models;
}

export async function assertOpenRouterModelAvailable(apiKey: string, modelId: string, kind: ModelKind = "text") {
  const models = await getOpenRouterModels(apiKey, kind);
  if (!models.some((model: NormalizedOpenRouterModel) => model.id === modelId)) {
    throw new Error(OPENROUTER_MODEL_UNAVAILABLE_MESSAGE);
  }
}
