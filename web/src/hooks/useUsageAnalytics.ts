import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useMemo } from "react";
import { startOfDay, subDays } from "date-fns";

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
  recentCalls: RecentUsageCall[];
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
  imageBreakdown: Array<{ provider: string; model_id: string; requests: number; total_cost: number }>;
  monthToDateSpend: number;
}

export interface RecentUsageCall {
  id: string;
  created_at: string;
  usage_type: string;
  provider: string;
  model_id: string;
  status: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  cost: number;
  latency_ms: number | null;
  session_id: string | null;
  post_id: string | null;
  generation_id: string | null;
}

export interface OpenRouterUsage {
  data?: { limit_remaining?: number; limitRemaining?: number; credits?: number };
  limit_remaining?: number;
  limitRemaining?: number;
  credits?: number;
}

export function useUsageAnalytics(days = 30) {
  const { user } = useAuth();

  const sinceDate = useMemo(() => {
    return startOfDay(subDays(new Date(), days)).toISOString();
  }, [days]);

  const { data: costs, isLoading, error } = useQuery({
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
      return api.get<OpenRouterUsage>("/analytics/openrouter-usage").catch(() => null);
    },
    enabled: !!user?.id,
    staleTime: 60 * 1000,
  });

  const summary = costs?.summary || { totalCost: 0, textCost: 0, imageCost: 0, totalTokens: 0, totalRequests: 0, avgLatency: 0, avgCostPerRequest: 0, avgCostPerPost: 0, postCount: 0, failedCalls: 0 };
  const modelBreakdown = costs?.modelBreakdown || [];
  const dailyUsage = costs?.daily || [];

  return { summary, modelBreakdown, dailyUsage, isLoading, error, costs, openRouterUsage };
}
