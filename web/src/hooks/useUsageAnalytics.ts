import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { startOfDay, subDays, format } from "date-fns";
import type { GenerationLog } from "@/lib/types";

export interface UsageSummary {
  totalCost: number;
  textCost: number;
  imageCost: number;
  totalTokens: number;
  totalRequests: number;
  avgLatency: number;
  avgCostPerRequest: number;
  avgCostPerPost: number;
  postCount: number;
  failedCalls: number;
}

export interface ModelBreakdown {
  model_id: string;
  requests: number;
  total_tokens: number;
  total_cost: number;
  avg_latency: number;
}

export interface DailyUsage {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
  text_cost?: number;
  image_cost?: number;
}

export interface CostAnalytics {
  summary: UsageSummary;
  providerBreakdown: Array<{ provider: string; usage_type: string; requests: number; total_cost: number; total_tokens: number }>;
  modelBreakdown: Array<ModelBreakdown & { usage_type?: string }>;
  daily: DailyUsage[];
  recentCalls: Array<GenerationLog & { generation_id?: string | null; usage_type: string; post_id: string | null }>;
  imageSummary: {
    total: number;
    ai: number;
    stock: number;
    source: number;
    cover: number;
    inline: number;
    totalCost: number;
    queued: number;
    failed: number;
    retries: number;
  };
}

export const usageDayKey = (value?: string | null) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? format(date, "yyyy-MM-dd") : null;
};

export function useUsageAnalytics(days = 30) {
  const { user } = useAuth();

  const sinceDate = useMemo(() => {
    return startOfDay(subDays(new Date(), days)).toISOString();
  }, [days]);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["generation-logs", user?.id, days],
    queryFn: async () => {
      if (!user?.id) return [];
      return api.get<GenerationLog[]>(`/analytics/usage?from=${sinceDate}`);
    },
    enabled: !!user?.id,
  });

  const { data: costs, isLoading: costsLoading } = useQuery({
    queryKey: ["cost-analytics", user?.id, days],
    queryFn: async () => {
      if (!user?.id) return null;
      return api.get<CostAnalytics>(`/analytics/costs?from=${sinceDate}`);
    },
    enabled: !!user?.id,
  });

  const { data: openRouterUsage } = useQuery({
    queryKey: ["openrouter-usage", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      return api.get<any>("/analytics/openrouter-usage").catch(() => null);
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const summary: UsageSummary = useMemo(() => {
    if (costs?.summary) return costs.summary;
    if (!logs.length) return { totalCost: 0, textCost: 0, imageCost: 0, totalTokens: 0, totalRequests: 0, avgLatency: 0, avgCostPerRequest: 0, avgCostPerPost: 0, postCount: 0, failedCalls: 0 };
    const totalCost = logs.reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
    const textCost = logs.filter((l) => (l.usage_type || (l.provider?.includes("image") ? "image" : "text")) === "text").reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
    const imageCost = totalCost - textCost;
    const totalTokens = logs.reduce((sum, l) => sum + (l.total_tokens || 0), 0);
    const totalRequests = logs.length;
    const latencies = logs.filter(l => l.latency_ms).map(l => l.latency_ms!);
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const posts = new Set(logs.map((l) => l.post_id).filter(Boolean));
    return { totalCost, textCost, imageCost, totalTokens, totalRequests, avgLatency, avgCostPerRequest: totalRequests ? totalCost / totalRequests : 0, avgCostPerPost: posts.size ? totalCost / posts.size : 0, postCount: posts.size, failedCalls: logs.filter((l) => l.status && l.status !== "success").length };
  }, [logs, costs]);

  const modelBreakdown: ModelBreakdown[] = useMemo(() => {
    if (costs?.modelBreakdown) return costs.modelBreakdown;
    const map = new Map<string, ModelBreakdown>();
    for (const l of logs) {
      const key = l.model_id || "unknown";
      const existing = map.get(key) || { model_id: key, requests: 0, total_tokens: 0, total_cost: 0, avg_latency: 0 };
      existing.requests += 1;
      existing.total_tokens += l.total_tokens || 0;
      existing.total_cost += Number(l.cost) || 0;
      map.set(key, existing);
    }
    for (const [key, val] of map) {
      const modelLogs = logs.filter(l => (l.model_id || "unknown") === key && l.latency_ms);
      val.avg_latency = modelLogs.length ? modelLogs.reduce((a, l) => a + l.latency_ms!, 0) / modelLogs.length : 0;
    }
    return Array.from(map.values()).sort((a, b) => b.total_cost - a.total_cost);
  }, [logs, costs]);

  const dailyUsage: DailyUsage[] = useMemo(() => {
    if (costs?.daily) return costs.daily;
    const map = new Map<string, DailyUsage>();
    for (const l of logs) {
      const date = usageDayKey(l.created_at);
      if (!date) continue;
      const existing = map.get(date) || { date, requests: 0, tokens: 0, cost: 0 };
      existing.requests += 1;
      existing.tokens += l.total_tokens || 0;
      existing.cost += Number(l.cost) || 0;
      map.set(date, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [logs, costs]);

  return { summary, modelBreakdown, dailyUsage, isLoading: isLoading || costsLoading, logs, costs, openRouterUsage };
}
