export interface AnalyticsDateRange {
  from?: Date;
  to?: Date;
}

export function parseAnalyticsDateRange(query: Record<string, string | undefined>): AnalyticsDateRange {
  const range: AnalyticsDateRange = {};
  for (const key of ["from", "to"] as const) {
    if (!query[key]) continue;
    const date = new Date(query[key]!);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid ${key} date`);
    if (key === "to" && /^\d{4}-\d{2}-\d{2}$/.test(query[key]!)) date.setUTCHours(23, 59, 59, 999);
    range[key] = date;
  }
  if (range.from && range.to && range.from > range.to) throw new Error("The from date must be before the to date");
  return range;
}

export function boundedRecentLimit(value: string | undefined) {
  const parsed = Number.parseInt(value || "", 10);
  return Math.min(100, Number.isFinite(parsed) && parsed > 0 ? parsed : 25);
}

export function normalizeAnalyticsSummary(summary: Record<string, unknown> | undefined) {
  const totalCost = Number(summary?.totalCost || 0);
  const totalRequests = Number(summary?.totalRequests || 0);
  const postCount = Number(summary?.postCount || 0);
  return {
    totalCost,
    textCost: Number(summary?.textCost || 0),
    imageCost: Number(summary?.imageCost || 0),
    totalRequests,
    failedCalls: Number(summary?.failedCalls || 0),
    totalTokens: Number(summary?.totalTokens || 0),
    avgLatency: Number(summary?.avgLatency || 0),
    avgCostPerRequest: totalRequests ? totalCost / totalRequests : 0,
    avgCostPerPost: postCount ? totalCost / postCount : 0,
    postCount,
  };
}
