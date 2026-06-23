import { Hono } from "hono";
import { db } from "../db/index.js";
import { generationLogs, imageAssets, imageGenerationRequests } from "../db/schema.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";
import { buildCostAnalytics, generationIdFromResponseData } from "../services/cost-analytics.js";

export const analyticsRoutes = new Hono();

analyticsRoutes.get("/usage", async (c) => {
  const userId = getUserId(c);
  const from = c.req.query("from");
  const to = c.req.query("to");

  const conditions = [eq(generationLogs.userId, userId)];
  if (from) conditions.push(gte(generationLogs.createdAt, new Date(from)));
  if (to) conditions.push(lte(generationLogs.createdAt, new Date(to)));

  const rows = await db
    .select()
    .from(generationLogs)
    .where(and(...conditions))
    .orderBy(generationLogs.createdAt);

  return c.json(rows.map((row) => ({
    id: row.id,
    user_id: row.userId,
    post_id: row.postId,
    usage_type: row.usageType,
    model_id: row.modelId,
    provider: row.provider,
    status: row.status,
    prompt_tokens: row.promptTokens,
    completion_tokens: row.completionTokens,
    total_tokens: row.totalTokens,
    cost: row.cost,
    latency_ms: row.latencyMs,
    trace_id: row.traceId,
    session_id: row.sessionId,
    raw_trace: row.rawTrace,
    request_data: row.requestData,
    response_data: row.responseData,
    generation_id: generationIdFromResponseData(row.responseData),
    created_at: row.createdAt?.toISOString(),
  })));
});

analyticsRoutes.get("/openrouter-usage", async (c) => {
  const apiKey = await getOpenRouterKey(getUserId(c));
  if (!apiKey) return c.json({ error: "OpenRouter API key not configured" }, 500);

  try {
    const keyResp = await fetch("https://openrouter.ai/api/v1/key", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const keyData = await keyResp.json();
    if (!keyResp.ok) return c.json({ error: keyData?.error?.message || "OpenRouter usage lookup failed" }, keyResp.status as any);

    return c.json(keyData);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

analyticsRoutes.get("/costs", async (c) => {
  const userId = getUserId(c);
  const from = c.req.query("from");
  const to = c.req.query("to");

  const logConditions = [eq(generationLogs.userId, userId)];
  const assetConditions = [eq(imageAssets.userId, userId)];
  const requestConditions = [eq(imageGenerationRequests.userId, userId)];
  if (from) {
    const date = new Date(from);
    logConditions.push(gte(generationLogs.createdAt, date));
    assetConditions.push(gte(imageAssets.createdAt, date));
    requestConditions.push(gte(imageGenerationRequests.createdAt, date));
  }
  if (to) {
    const date = new Date(to);
    logConditions.push(lte(generationLogs.createdAt, date));
    assetConditions.push(lte(imageAssets.createdAt, date));
    requestConditions.push(lte(imageGenerationRequests.createdAt, date));
  }

  const [logs, assets, requests] = await Promise.all([
    db.select().from(generationLogs).where(and(...logConditions)).orderBy(desc(generationLogs.createdAt)),
    db.select({
      type: imageAssets.type,
      sourceKind: imageAssets.sourceKind,
      provider: imageAssets.provider,
      modelId: imageAssets.modelId,
      cost: imageAssets.cost,
      createdAt: imageAssets.createdAt,
    }).from(imageAssets).where(and(...assetConditions)),
    db.select({
      status: imageGenerationRequests.status,
      retryCount: imageGenerationRequests.retryCount,
      createdAt: imageGenerationRequests.createdAt,
    }).from(imageGenerationRequests).where(and(...requestConditions)),
  ]);

  return c.json(buildCostAnalytics({ logs, imageAssets: assets, imageRequests: requests }));
});
