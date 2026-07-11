export interface ImageCostRow {
  provider: string;
  model_id: string;
  requests: number;
  total_cost: number;
}

export interface ImageProviderSummary {
  provider: string;
  label: string;
  imageCount: number;
  totalCost: number;
  models: Map<string, { count: number; cost: number }>;
}

const PROVIDER_LABELS: Record<string, string> = {
  "openrouter-image": "OpenRouter",
  "openai-image": "OpenAI",
};

export function summarizeImageCosts(breakdown: ImageCostRow[]) {
  const summaries = new Map<string, ImageProviderSummary>();
  for (const row of breakdown) {
    const provider = row.provider || "unknown";
    const model = row.model_id || "unknown";
    const cost = Number(row.total_cost) || 0;
    const count = Number(row.requests) || 0;
    const summary = summaries.get(provider) || {
      provider,
      label: PROVIDER_LABELS[provider] || provider,
      imageCount: 0,
      totalCost: 0,
      models: new Map(),
    };
    summary.imageCount += count;
    summary.totalCost += cost;
    const modelEntry = summary.models.get(model) || { count: 0, cost: 0 };
    modelEntry.count += count;
    modelEntry.cost += cost;
    summary.models.set(model, modelEntry);
    summaries.set(provider, summary);
  }
  return Array.from(summaries.values()).sort((left, right) => right.totalCost - left.totalCost);
}
