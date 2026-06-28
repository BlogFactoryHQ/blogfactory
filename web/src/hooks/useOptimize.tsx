import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSites } from "@/hooks/useSites";

export type OptimizeStatus = "all" | "needs_attention" | "tracking" | "improved";
export type OptimizeOpportunity = "all" | "needs_attention" | "growing" | "almost_ranking" | "page_two" | "low_ctr" | "zero_clicks" | "weak_focus" | "wrong_page_risk";

export interface OptimizeMetricSummary {
  clicks: number;
  impressions: number;
  position: number;
}

export interface OptimizePage {
  id: string;
  pageUrl: string;
  page_url: string;
  targetQuery: string;
  target_query: string;
  status: OptimizeStatus | string;
  baselineMetrics: OptimizeMetricSummary | null;
  baseline_metrics: OptimizeMetricSummary | null;
  latestMetrics: OptimizeMetricSummary | null;
  latest_metrics: OptimizeMetricSummary | null;
  optimizedAt: string | null;
  optimized_at: string | null;
  updatedAt: string;
  updated_at: string;
}

export interface OptimizeAnalysis {
  id: string;
  pageUrl: string;
  page_url: string;
  targetQuery: string;
  target_query: string;
  ownContentSnapshot: ContentSnapshot;
  own_content_snapshot: ContentSnapshot;
  competitorSnapshots: ContentSnapshot[];
  competitor_snapshots: ContentSnapshot[];
  suggestions: Array<{ impact: "high" | "medium" | "low"; title: string; detail: string }>;
  createdAt: string;
  created_at: string;
}

export interface OptimizePageInsight {
  pageUrl: string;
  topQuery: string;
  status: OptimizeStatus | string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  baseline: OptimizeMetricSummary & { ctr: number };
  latest: OptimizeMetricSummary & { ctr: number };
  delta: { clicks: number; impressions: number; position: number; ctr: number };
  opportunities: string[];
  suggestedAction: string;
  topQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
}

export interface OptimizeSummary {
  lastSyncAt: string | null;
  last_sync_at: string | null;
  pageCount: number;
  page_count: number;
  queryCount: number;
  query_count: number;
  clicks: number;
  impressions: number;
  needsAttentionCount: number;
  needs_attention_count: number;
  topGrowingPage: OptimizePageInsight | null;
  top_growing_page: OptimizePageInsight | null;
  biggestDecliningPage: OptimizePageInsight | null;
  biggest_declining_page: OptimizePageInsight | null;
  bestQuickWin: OptimizePageInsight | null;
  best_quick_win: OptimizePageInsight | null;
  opportunityCounts: Record<string, number>;
  opportunity_counts: Record<string, number>;
  statusCounts: Record<string, number>;
  status_counts: Record<string, number>;
}

export interface OptimizePageDetail {
  insight: OptimizePageInsight | null;
  dailyHistory: Array<OptimizeMetricSummary & { date: string; ctr: number }>;
  daily_history: Array<OptimizeMetricSummary & { date: string; ctr: number }>;
  queries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>;
  queryIntentSummary: string;
  query_intent_summary: string;
  actionPlan: Array<{ opportunity: string; title: string; detail: string }>;
  action_plan: Array<{ opportunity: string; title: string; detail: string }>;
  analyses: OptimizeAnalysis[];
  internalLinkTargets: Array<{ title?: string; url?: string; path?: string }>;
  internal_link_targets: Array<{ title?: string; url?: string; path?: string }>;
}

export interface ContentSnapshot {
  url: string;
  title?: string;
  wordCount: number;
  sectionCount: number;
  features: { faq: boolean; table: boolean; video: boolean; tableOfContents: boolean; images: number };
  error?: string;
}

interface AnalyzeInput {
  pageUrl: string;
  targetQuery: string;
  competitorUrls: string[];
}

export function useOptimize(status: OptimizeStatus = "all", siteId?: string | null) {
  const { activeSiteId } = useSites();
  const resolvedSiteId = siteId || activeSiteId;
  const queryClient = useQueryClient();
  const queryKey = ["optimize-pages", resolvedSiteId, status];

  const pages = useQuery({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ siteId: resolvedSiteId || "", status });
      return api.get<{ pages: OptimizePage[] }>(`/optimize/pages?${params.toString()}`);
    },
    enabled: !!resolvedSiteId,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["optimize-pages", resolvedSiteId] });

  const analyze = useMutation({
    mutationFn: async (input: AnalyzeInput) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      return api.post<{ page: OptimizePage; analysis: OptimizeAnalysis }>("/optimize/analyze", { ...input, siteId: resolvedSiteId });
    },
    onSuccess: invalidate,
  });

  const markOptimized = useMutation({
    mutationFn: async (id: string) => api.post<{ page: OptimizePage }>(`/optimize/pages/${id}/mark-optimized`),
    onSuccess: invalidate,
  });

  const loadAnalyses = useMutation({
    mutationFn: async (input: { pageUrl?: string; targetQuery?: string }) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      const params = new URLSearchParams({ siteId: resolvedSiteId });
      if (input.pageUrl) params.set("pageUrl", input.pageUrl);
      if (input.targetQuery) params.set("targetQuery", input.targetQuery);
      return api.get<{ analyses: OptimizeAnalysis[] }>(`/optimize/analyses?${params.toString()}`);
    },
  });

  return {
    pages: pages.data?.pages || [],
    isLoading: pages.isLoading,
    analyze,
    loadAnalyses,
    markOptimized,
  };
}

export function useOptimizeInsights(status: OptimizeStatus = "all", opportunity: OptimizeOpportunity = "all", siteId?: string | null) {
  const { activeSiteId } = useSites();
  const resolvedSiteId = siteId || activeSiteId;
  const queryClient = useQueryClient();

  const summary = useQuery({
    queryKey: ["optimize-summary", resolvedSiteId],
    queryFn: async () => api.get<OptimizeSummary>(`/optimize/summary?siteId=${encodeURIComponent(resolvedSiteId || "")}`),
    enabled: !!resolvedSiteId,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const pages = useQuery({
    queryKey: ["optimize-page-insights", resolvedSiteId, status, opportunity],
    queryFn: async () => {
      const params = new URLSearchParams({ siteId: resolvedSiteId || "", status, opportunity });
      return api.get<{ pages: OptimizePageInsight[] }>(`/optimize/page-insights?${params.toString()}`);
    },
    enabled: !!resolvedSiteId,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const detail = useMutation({
    mutationFn: async (pageUrl: string) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      return api.get<OptimizePageDetail>(`/optimize/page-insights/${encodeURIComponent(pageUrl)}?siteId=${encodeURIComponent(resolvedSiteId)}`);
    },
  });

  return {
    summary: summary.data,
    pageInsights: pages.data?.pages || [],
    isLoadingSummary: summary.isLoading,
    isLoadingPageInsights: pages.isLoading,
    loadPageDetail: detail,
    invalidateInsights: () => {
      queryClient.invalidateQueries({ queryKey: ["optimize-summary", resolvedSiteId] });
      queryClient.invalidateQueries({ queryKey: ["optimize-page-insights", resolvedSiteId] });
    },
  };
}
