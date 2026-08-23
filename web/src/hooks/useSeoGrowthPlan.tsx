import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSites } from "@/hooks/useSites";

export type SeoActionType = "new_content" | "refresh" | "snippet_test" | "internal_link" | "indexing_investigation";
export type SeoPlanStage = "planned" | "drafting" | "review" | "delivered" | "blocked" | "measuring";

export interface SeoPlanItem {
  id: string;
  campaignId: string;
  position: number;
  keyword: string | null;
  title: string | null;
  input: string;
  actionType: SeoActionType;
  pageUrl: string | null;
  plannedFor: string | null;
  planningStatus: "planned" | "in_progress" | "completed" | "blocked";
  evidence: {
    opportunities?: string[];
    recommendation?: string;
    baseline_metrics?: { clicks: number; impressions: number; ctr: number; position: number };
    baseline_date?: string | null;
    captured_at?: string;
    source?: string;
  } | null;
  postId: string | null;
  jobId: string | null;
  stage: SeoPlanStage;
  blocker: string | null;
  publicationUrl: string | null;
}

export interface SeoGrowthPlanResponse {
  campaign: { id: string; name: string; createdAt: string; updatedAt: string } | null;
  items: SeoPlanItem[];
  summary: Record<SeoPlanStage | "total", number>;
  freshness: { dataThrough: string | null; syncedAt: string | null };
  generatedAt?: string;
}

export interface SeoGrowthAttribution {
  scope: "blogfactory_correlated_content";
  disclaimer: string;
  freshness: SeoGrowthPlanResponse["freshness"];
  cohort: Array<{
    itemId: string;
    title: string | null;
    targetQuery: string | null;
    pageUrl: string;
    actionType: SeoActionType;
    baselineDate: string;
    baseline: { clicks: number; impressions: number; ctr: number; position: number };
    windows: Array<{ days: 7 | 14 | 28; endDate: string; status: "observed" | "pending"; baseline: { clicks: number; impressions: number; ctr: number; position: number }; metrics: { clicks: number; impressions: number; ctr: number; position: number }; delta: { clicks: number; impressions: number; ctr: number; position: number } | null }>;
  }>;
}

export function useSeoGrowthPlan() {
  const { activeSiteId } = useSites();
  const queryClient = useQueryClient();
  const key = ["seo-growth-plan", activeSiteId];
  const plan = useQuery({
    queryKey: key,
    queryFn: () => api.get<SeoGrowthPlanResponse>(`/optimize/growth-plan?siteId=${encodeURIComponent(activeSiteId || "")}`),
    enabled: Boolean(activeSiteId),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: key });
    queryClient.invalidateQueries({ queryKey: ["seo-growth-attribution", activeSiteId] });
    queryClient.invalidateQueries({ queryKey: ["workspace-digest", activeSiteId] });
  };
  const generate = useMutation({
    mutationFn: () => api.post<SeoGrowthPlanResponse>("/optimize/growth-plan/generate", { siteId: activeSiteId }),
    onSuccess: invalidate,
  });
  const addItem = useMutation({
    mutationFn: (input: { targetQuery: string; actionType: SeoActionType; pageUrl?: string; plannedFor?: string; title?: string }) =>
      api.post("/optimize/growth-plan/items", { siteId: activeSiteId, ...input }),
    onSuccess: invalidate,
  });
  const updateItem = useMutation({
    mutationFn: ({ id, ...input }: { id: string; plannedFor?: string; planningStatus?: SeoPlanItem["planningStatus"] }) =>
      api.patch(`/optimize/growth-plan/items/${id}`, { siteId: activeSiteId, ...input }),
    onSuccess: invalidate,
  });
  return { activeSiteId, plan, generate, addItem, updateItem };
}

export function useSeoGrowthAttribution() {
  const { activeSiteId } = useSites();
  return useQuery({
    queryKey: ["seo-growth-attribution", activeSiteId],
    queryFn: () => api.get<SeoGrowthAttribution>(`/optimize/growth-plan/attribution?siteId=${encodeURIComponent(activeSiteId || "")}`),
    enabled: Boolean(activeSiteId),
  });
}
