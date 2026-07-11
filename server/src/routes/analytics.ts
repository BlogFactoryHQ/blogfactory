import { Hono } from "hono";
import { db } from "../db/index.js";
import { generationLogs, imageAssets, imageGenerationRequests } from "../db/schema.js";
import { eq, and, gte, lte, desc, sql, type SQL } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { getOpenRouterKey } from "../services/api-keys.js";
import { boundedRecentLimit, normalizeAnalyticsSummary, parseAnalyticsDateRange, type AnalyticsDateRange } from "./analytics-query.js";

export const analyticsRoutes = new Hono();

analyticsRoutes.get("/usage", async (c) => {
  const userId = getUserId(c);
  let range: AnalyticsDateRange;
  try {
    range = parseAnalyticsDateRange(c.req.query());
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid date range" }, 400);
  }
  const conditions = logDateConditions(userId, range);

  const rows = await db
    .select({
      id: generationLogs.id,
      postId: generationLogs.postId,
      usageType: usageTypeSql,
      modelId: generationLogs.modelId,
      provider: generationLogs.provider,
      status: generationLogs.status,
      promptTokens: generationLogs.promptTokens,
      completionTokens: generationLogs.completionTokens,
      totalTokens: generationLogs.totalTokens,
      cost: generationLogs.cost,
      latencyMs: generationLogs.latencyMs,
      traceId: generationLogs.traceId,
      sessionId: generationLogs.sessionId,
      generationId: generationIdSql,
      createdAt: generationLogs.createdAt,
    })
    .from(generationLogs)
    .where(and(...conditions))
    .orderBy(desc(generationLogs.createdAt))
    .limit(boundedRecentLimit(c.req.query("limit")));

  return c.json(rows.map((row) => ({
    id: row.id,
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
    generation_id: row.generationId,
    created_at: row.createdAt?.toISOString(),
  })));
});

analyticsRoutes.get("/usage/:id", async (c) => {
  const [row] = await db.select().from(generationLogs).where(and(
    eq(generationLogs.id, c.req.param("id")),
    eq(generationLogs.userId, getUserId(c)),
  )).limit(1);
  if (!row) return c.json({ error: "Usage record not found" }, 404);
  return c.json({
    id: row.id,
    trace_id: row.traceId,
    raw_trace: row.rawTrace,
    request_data: row.requestData,
    response_data: row.responseData,
  });
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
  let range: AnalyticsDateRange;
  try {
    range = parseAnalyticsDateRange(c.req.query());
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Invalid date range" }, 400);
  }
  const logConditions = logDateConditions(userId, range);
  const assetConditions = datedConditions(eq(imageAssets.userId, userId), imageAssets.createdAt, range);
  const requestConditions = datedConditions(eq(imageGenerationRequests.userId, userId), imageGenerationRequests.createdAt, range);
  const totalCostSql = sql<number>`coalesce(sum(${generationLogs.cost}), 0)::float8`;
  const requestsSql = sql<number>`count(*)::int`;
  const tokensSql = sql<number>`coalesce(sum(${generationLogs.totalTokens}), 0)::bigint`;
  const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));

  const [[summary], providerBreakdown, modelBreakdown, daily, recentCalls, [imageSummary], [requestSummary], imageBreakdown, [month]] = await Promise.all([
    db.select({
      totalCost: totalCostSql,
      textCost: sql<number>`coalesce(sum(${generationLogs.cost}) filter (where ${usageTypeSql} = 'text'), 0)::float8`,
      imageCost: sql<number>`coalesce(sum(${generationLogs.cost}) filter (where ${usageTypeSql} = 'image'), 0)::float8`,
      totalRequests: requestsSql,
      failedCalls: sql<number>`count(*) filter (where ${generationLogs.status} is not null and ${generationLogs.status} <> 'success')::int`,
      totalTokens: tokensSql,
      avgLatency: sql<number>`coalesce(avg(nullif(${generationLogs.latencyMs}, 0)), 0)::float8`,
      postCount: sql<number>`count(distinct ${generationLogs.postId})::int`,
    }).from(generationLogs).where(and(...logConditions)),
    db.select({ provider: sql<string>`coalesce(${generationLogs.provider}, 'unknown')`, usage_type: usageTypeSql, requests: requestsSql, total_cost: totalCostSql, total_tokens: tokensSql })
      .from(generationLogs).where(and(...logConditions)).groupBy(generationLogs.provider, usageTypeSql),
    db.select({ model_id: sql<string>`coalesce(${generationLogs.modelId}, 'unknown')`, usage_type: usageTypeSql, requests: requestsSql, total_cost: totalCostSql, total_tokens: tokensSql, avg_latency: sql<number>`coalesce(avg(nullif(${generationLogs.latencyMs}, 0)), 0)::float8` })
      .from(generationLogs).where(and(...logConditions)).groupBy(generationLogs.modelId, usageTypeSql),
    db.select({ date: sql<string>`to_char((${generationLogs.createdAt} at time zone 'UTC')::date, 'YYYY-MM-DD')`, requests: requestsSql, tokens: tokensSql, cost: totalCostSql, text_cost: sql<number>`coalesce(sum(${generationLogs.cost}) filter (where ${usageTypeSql} = 'text'), 0)::float8`, image_cost: sql<number>`coalesce(sum(${generationLogs.cost}) filter (where ${usageTypeSql} = 'image'), 0)::float8` })
      .from(generationLogs).where(and(...logConditions)).groupBy(sql`(${generationLogs.createdAt} at time zone 'UTC')::date`).orderBy(sql`(${generationLogs.createdAt} at time zone 'UTC')::date`),
    db.select({ id: generationLogs.id, created_at: generationLogs.createdAt, usage_type: usageTypeSql, provider: sql<string>`coalesce(${generationLogs.provider}, 'unknown')`, model_id: sql<string>`coalesce(${generationLogs.modelId}, 'unknown')`, status: sql<string>`coalesce(${generationLogs.status}, 'unknown')`, prompt_tokens: generationLogs.promptTokens, completion_tokens: generationLogs.completionTokens, total_tokens: generationLogs.totalTokens, cost: generationLogs.cost, latency_ms: generationLogs.latencyMs, session_id: generationLogs.sessionId, post_id: generationLogs.postId, generation_id: generationIdSql })
      .from(generationLogs).where(and(...logConditions)).orderBy(desc(generationLogs.createdAt)).limit(25),
    db.select({ total: sql<number>`count(*)::int`, ai: sql<number>`count(*) filter (where ${imageAssets.sourceKind} like '%ai%' or ${imageAssets.provider} like '%image%')::int`, stock: sql<number>`count(*) filter (where ${imageAssets.sourceKind} = 'stock')::int`, source: sql<number>`count(*) filter (where ${imageAssets.sourceKind} = 'source')::int`, cover: sql<number>`count(*) filter (where ${imageAssets.type} = 'cover')::int`, inline: sql<number>`count(*) filter (where ${imageAssets.type} = 'inline')::int` }).from(imageAssets).where(and(...assetConditions)),
    db.select({ queued: sql<number>`count(*) filter (where ${imageGenerationRequests.status} = 'queued')::int`, failed: sql<number>`count(*) filter (where ${imageGenerationRequests.status} = 'failed')::int`, retries: sql<number>`coalesce(sum(${imageGenerationRequests.retryCount}), 0)::int` }).from(imageGenerationRequests).where(and(...requestConditions)),
    db.select({ provider: sql<string>`coalesce(${generationLogs.provider}, 'unknown')`, model_id: sql<string>`coalesce(${generationLogs.modelId}, 'unknown')`, requests: requestsSql, total_cost: totalCostSql })
      .from(generationLogs).where(and(...logConditions, eq(usageTypeSql, "image"))).groupBy(generationLogs.provider, generationLogs.modelId),
    db.select({ spend: sql<number>`coalesce(sum(${generationLogs.cost}), 0)::float8` }).from(generationLogs).where(and(eq(generationLogs.userId, userId), gte(generationLogs.createdAt, monthStart))),
  ]);

  const normalizedSummary = normalizeAnalyticsSummary(summary);

  return c.json({
    summary: normalizedSummary,
    providerBreakdown: providerBreakdown.map(numericAnalyticsRow).sort(byTotalCost),
    modelBreakdown: modelBreakdown.map(numericAnalyticsRow).sort(byTotalCost),
    daily: daily.map(numericAnalyticsRow),
    recentCalls: recentCalls.map((row) => ({ ...row, created_at: row.created_at.toISOString(), cost: Number(row.cost || 0) })),
    imageSummary: {
      total: Number(imageSummary?.total || 0), ai: Number(imageSummary?.ai || 0), stock: Number(imageSummary?.stock || 0), source: Number(imageSummary?.source || 0),
      cover: Number(imageSummary?.cover || 0), inline: Number(imageSummary?.inline || 0), totalCost: normalizedSummary.imageCost,
      queued: Number(requestSummary?.queued || 0), failed: Number(requestSummary?.failed || 0), retries: Number(requestSummary?.retries || 0),
    },
    imageBreakdown: imageBreakdown.map(numericAnalyticsRow).sort(byTotalCost),
    monthToDateSpend: Number(month?.spend || 0),
  });
});

const usageTypeSql = sql<string>`coalesce(${generationLogs.usageType}, case when ${generationLogs.provider} like '%image%' then 'image' else 'text' end)`;
const generationIdSql = sql<string | null>`coalesce(${generationLogs.responseData}->>'id', ${generationLogs.responseData}->'generation'->>'id')`;

function logDateConditions(userId: string, range: AnalyticsDateRange): SQL[] {
  return datedConditions(eq(generationLogs.userId, userId), generationLogs.createdAt, range);
}

function datedConditions(base: SQL, column: typeof generationLogs.createdAt | typeof imageAssets.createdAt | typeof imageGenerationRequests.createdAt, range: AnalyticsDateRange): SQL[] {
  const conditions = [base];
  if (range.from) conditions.push(gte(column, range.from));
  if (range.to) conditions.push(lte(column, range.to));
  return conditions;
}

function numericAnalyticsRow<T extends Record<string, unknown>>(row: T) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    ["requests", "total_cost", "total_tokens", "avg_latency", "tokens", "cost", "text_cost", "image_cost"].includes(key) ? Number(value || 0) : value,
  ])) as T;
}

function byTotalCost(left: { total_cost?: unknown }, right: { total_cost?: unknown }) {
  return Number(right.total_cost || 0) - Number(left.total_cost || 0);
}
