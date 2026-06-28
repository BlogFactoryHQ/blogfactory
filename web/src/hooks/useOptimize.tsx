import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSites } from "@/hooks/useSites";

export type OptimizeStatus = "all" | "needs_attention" | "tracking" | "improved";

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
