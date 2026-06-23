export interface CostLogRow {
  id: string;
  postId?: string | null;
  usageType?: string | null;
  modelId?: string | null;
  provider?: string | null;
  status?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  cost?: number | null;
  latencyMs?: number | null;
  sessionId?: string | null;
  responseData?: unknown;
  createdAt?: Date | string | null;
}

export interface CostImageAssetRow {
  type?: string | null;
  sourceKind?: string | null;
  provider?: string | null;
  modelId?: string | null;
  cost?: number | null;
  createdAt?: Date | string | null;
}

export interface CostImageRequestRow {
  status?: string | null;
  retryCount?: number | null;
  createdAt?: Date | string | null;
}

const money = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const dayKey = (value?: Date | string | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "unknown";
};

export function generationIdFromResponseData(value: unknown) {
  const data = value as { id?: unknown; generation?: { id?: unknown } } | null;
  if (typeof data?.id === "string") return data.id;
  if (typeof data?.generation?.id === "string") return data.generation.id;
  return null;
}

export function usageTypeForLog(log: CostLogRow) {
  if (log.usageType) return log.usageType;
  return log.provider?.includes("image") ? "image" : "text";
}

export function buildCostAnalytics(input: {
  logs: CostLogRow[];
  imageAssets?: CostImageAssetRow[];
  imageRequests?: CostImageRequestRow[];
}) {
  const logs = input.logs || [];
  const imageAssets = input.imageAssets || [];
  const imageRequests = input.imageRequests || [];
  const summary = {
    totalCost: 0,
    textCost: 0,
    imageCost: 0,
    totalRequests: logs.length,
    failedCalls: 0,
    totalTokens: 0,
    avgLatency: 0,
    avgCostPerRequest: 0,
    avgCostPerPost: 0,
    postCount: 0,
  };
  const latencies: number[] = [];
  const posts = new Set<string>();
  const provider = new Map<string, any>();
  const model = new Map<string, any>();
  const daily = new Map<string, any>();

  for (const log of logs) {
    const type = usageTypeForLog(log);
    const cost = money(log.cost);
    summary.totalCost += cost;
    if (type === "image") summary.imageCost += cost;
    else summary.textCost += cost;
    summary.totalTokens += Number(log.totalTokens || 0);
    if (log.status && log.status !== "success") summary.failedCalls += 1;
    if (log.latencyMs) latencies.push(log.latencyMs);
    if (log.postId) posts.add(log.postId);

    const providerKey = `${type}:${log.provider || "unknown"}`;
    const providerRow = provider.get(providerKey) || { provider: log.provider || "unknown", usage_type: type, requests: 0, total_cost: 0, total_tokens: 0 };
    providerRow.requests += 1;
    providerRow.total_cost += cost;
    providerRow.total_tokens += Number(log.totalTokens || 0);
    provider.set(providerKey, providerRow);

    const modelKey = `${type}:${log.modelId || "unknown"}`;
    const modelRow = model.get(modelKey) || { model_id: log.modelId || "unknown", usage_type: type, requests: 0, total_cost: 0, total_tokens: 0 };
    modelRow.requests += 1;
    modelRow.total_cost += cost;
    modelRow.total_tokens += Number(log.totalTokens || 0);
    model.set(modelKey, modelRow);

    const day = dayKey(log.createdAt);
    const dayRow = daily.get(day) || { date: day, cost: 0, text_cost: 0, image_cost: 0, requests: 0, tokens: 0 };
    dayRow.cost += cost;
    dayRow[type === "image" ? "image_cost" : "text_cost"] += cost;
    dayRow.requests += 1;
    dayRow.tokens += Number(log.totalTokens || 0);
    daily.set(day, dayRow);
  }

  summary.avgLatency = latencies.length ? latencies.reduce((sum, value) => sum + value, 0) / latencies.length : 0;
  summary.avgCostPerRequest = logs.length ? summary.totalCost / logs.length : 0;
  summary.postCount = posts.size;
  summary.avgCostPerPost = posts.size ? summary.totalCost / posts.size : 0;

  const imageSummary = {
    total: imageAssets.length,
    ai: imageAssets.filter((asset) => (asset.sourceKind || "").includes("ai") || (asset.provider || "").includes("image") || (asset.provider || "").includes("google-ai-studio")).length,
    stock: imageAssets.filter((asset) => asset.sourceKind === "stock").length,
    source: imageAssets.filter((asset) => asset.sourceKind === "source").length,
    cover: imageAssets.filter((asset) => asset.type === "cover").length,
    inline: imageAssets.filter((asset) => asset.type === "inline").length,
    totalCost: summary.imageCost,
    queued: imageRequests.filter((request) => request.status === "queued").length,
    failed: imageRequests.filter((request) => request.status === "failed").length,
    retries: imageRequests.reduce((sum, request) => sum + Number(request.retryCount || 0), 0),
  };

  return {
    summary,
    providerBreakdown: Array.from(provider.values()).sort((a, b) => b.total_cost - a.total_cost),
    modelBreakdown: Array.from(model.values()).sort((a, b) => b.total_cost - a.total_cost),
    daily: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
    recentCalls: logs.slice(0, 100).map((log) => ({
      id: log.id,
      created_at: log.createdAt instanceof Date ? log.createdAt.toISOString() : log.createdAt,
      usage_type: usageTypeForLog(log),
      provider: log.provider || "unknown",
      model_id: log.modelId || "unknown",
      status: log.status || "unknown",
      prompt_tokens: log.promptTokens || 0,
      completion_tokens: log.completionTokens || 0,
      total_tokens: log.totalTokens || 0,
      cost: money(log.cost),
      latency_ms: log.latencyMs || null,
      session_id: log.sessionId || null,
      post_id: log.postId || null,
      generation_id: generationIdFromResponseData(log.responseData),
    })),
    imageSummary,
  };
}
