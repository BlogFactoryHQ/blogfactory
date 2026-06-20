import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { startOfDay, subDays, format } from "date-fns";
import type { GenerationLog } from "@/lib/types";

export interface UsageSummary {
  totalCost: number;
  totalTokens: number;
  totalRequests: number;
  avgLatency: number;
  avgCostPerRequest: number;
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
}

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

  const summary: UsageSummary = useMemo(() => {
    if (!logs.length) return { totalCost: 0, totalTokens: 0, totalRequests: 0, avgLatency: 0, avgCostPerRequest: 0 };
    const totalCost = logs.reduce((sum, l) => sum + (Number(l.cost) || 0), 0);
    const totalTokens = logs.reduce((sum, l) => sum + (l.total_tokens || 0), 0);
    const totalRequests = logs.length;
    const latencies = logs.filter(l => l.latency_ms).map(l => l.latency_ms!);
    const avgLatency = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    return { totalCost, totalTokens, totalRequests, avgLatency, avgCostPerRequest: totalRequests ? totalCost / totalRequests : 0 };
  }, [logs]);

  const modelBreakdown: ModelBreakdown[] = useMemo(() => {
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
  }, [logs]);

  const dailyUsage: DailyUsage[] = useMemo(() => {
    const map = new Map<string, DailyUsage>();
    for (const l of logs) {
      const date = format(new Date(l.created_at), "yyyy-MM-dd");
      const existing = map.get(date) || { date, requests: 0, tokens: 0, cost: 0 };
      existing.requests += 1;
      existing.tokens += l.total_tokens || 0;
      existing.cost += Number(l.cost) || 0;
      map.set(date, existing);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [logs]);

  return { summary, modelBreakdown, dailyUsage, isLoading, logs };
}
