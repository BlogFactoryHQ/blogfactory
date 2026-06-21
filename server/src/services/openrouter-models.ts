const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_TTL = 60 * 60 * 1000;

export const OPENROUTER_MODEL_UNAVAILABLE_MESSAGE =
  "Selected model is no longer available on OpenRouter. Pick a live model in settings/persona/feed.";

type ModelKind = "text" | "image";
type NormalizedOpenRouterModel = ReturnType<typeof normalizeOpenRouterModel>;

const BLOG_TEXT_MODEL_IDS = new Set([
  "deepseek/deepseek-v4-flash",
  "mistralai/mistral-small-3.2-24b-instruct",
  "deepseek/deepseek-v3.2",
  "openai/gpt-4o-mini",
  "mistralai/mistral-small-2603",
  "openai/gpt-5-mini",
  "google/gemini-2.5-flash",
  "x-ai/grok-4.3",
  "google/gemini-3-flash-preview",
  "anthropic/claude-3.5-haiku",
  "google/gemini-2.5-pro",
  "openai/gpt-4o",
  "openai/gpt-5",
  "openai/gpt-5.1",
  "openai/gpt-5.2",
  "anthropic/claude-sonnet-4",
  "anthropic/claude-sonnet-4.5",
  "anthropic/claude-opus-4.5",
]);

let modelsCache: Record<ModelKind, { data: NormalizedOpenRouterModel[]; ts: number } | null> = {
  text: null,
  image: null,
};

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

export function normalizeOpenRouterModel(model: any, kind: ModelKind) {
  const prompt = dollarsPerMillion(model.pricing?.prompt);
  const completion = dollarsPerMillion(model.pricing?.completion);
  const image = Number(model.pricing?.image ?? 0);
  const request = Number(model.pricing?.request ?? 0);
  const pricing = classifyPricing(prompt, completion, image, request);

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
    rawPricing: { prompt, completion, image, request },
    contextLength: model.context_length ?? null,
    modalities: {
      input: model.architecture?.input_modalities || [],
      output: model.architecture?.output_modalities || [],
    },
    created: model.created ?? null,
    supportedParameters: model.supported_parameters || [],
    ...(kind === "image" ? { apiProvider: "openrouter", constraints: null } : {}),
  };
}

export function catalogFromOpenRouterPayload(data: any, kind: ModelKind) {
  return (data.data || [])
    .filter((model: any) => model.architecture?.output_modalities?.includes(kind))
    .filter((model: any) => kind !== "text" || BLOG_TEXT_MODEL_IDS.has(model.id))
    .map((model: any) => normalizeOpenRouterModel(model, kind));
}

export async function getOpenRouterModels(apiKey: string, kind: ModelKind, refresh = false) {
  const cached = modelsCache[kind];
  if (!refresh && cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  const url = new URL(OPENROUTER_MODELS_URL);
  url.searchParams.set("output_modalities", kind);
  url.searchParams.set("sort", kind === "text" ? "pricing-low-to-high" : "most-popular");

  const resp = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
  if (!resp.ok) throw new Error(`OpenRouter model refresh failed (${resp.status})`);

  const models = catalogFromOpenRouterPayload(await resp.json(), kind);
  modelsCache[kind] = { data: models, ts: Date.now() };
  return models;
}

export async function assertOpenRouterModelAvailable(apiKey: string, modelId: string, kind: ModelKind = "text") {
  const models = await getOpenRouterModels(apiKey, kind);
  if (!models.some((model: NormalizedOpenRouterModel) => model.id === modelId)) {
    throw new Error(OPENROUTER_MODEL_UNAVAILABLE_MESSAGE);
  }
}
