type ImageLabelInput = {
  provider?: string | null;
  model_id?: string | null;
  model?: string | null;
  source_kind?: string | null;
  sourceKind?: string | null;
  license_label?: string | null;
  licenseLabel?: string | null;
};

const STOCK_PROVIDERS = new Set(["pexels", "pixabay", "openverse", "stock-fallback"]);

export function imageProviderName(provider?: string | null) {
  if (!provider) return "Source";
  if (provider === "ai-deferred") return "AI";
  if (provider === "stock-fallback") return "Historical stock";
  if (provider === "pexels") return "Pexels";
  if (provider === "pixabay") return "Pixabay";
  if (provider === "openverse") return "Openverse";
  if (provider === "openrouter-image") return "OpenRouter";
  if (provider === "openai-image") return "OpenAI";
  return provider.replace(/[-_]/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function imageSourceLabel(image: ImageLabelInput) {
  const provider = image.provider || "";
  const model = image.model_id || image.model || "";
  const sourceKind = image.source_kind || image.sourceKind;
  const license = image.license_label || image.licenseLabel;
  const isStock = sourceKind === "stock" || STOCK_PROVIDERS.has(provider);
  const isAi = sourceKind === "ai" || provider === "openrouter-image" || provider === "ai-deferred";
  if (isStock) return `Stock: ${imageProviderName(provider)}${license ? ` · ${license}` : ""}`;
  if (isAi) return `AI model: ${model || imageProviderName(provider)}`;
  return model ? `AI model: ${model}` : imageProviderName(provider);
}

export function isStockProvider(provider?: string | null) {
  return STOCK_PROVIDERS.has(provider || "");
}
