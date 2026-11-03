import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSites } from "@/hooks/useSites";

export type Severity = "error" | "warn" | "info";
export interface AuditIssue { rule: string; severity: Severity; detail: string }
export interface SiteAudit {
  checkedAt: string;
  pagesChecked: number;
  score: number;
  summary: Record<Severity, number>;
  siteIssues: AuditIssue[];
  pages: Array<{ url: string; issues: AuditIssue[] }>;
  notes: string[];
}
export interface RankRow {
  id: string;
  keyword: string;
  position: number | null;
  url: string | null;
  lastCheckedAt: string | null;
  change: number | null;
  history: Array<{ date: string; position: number | null }>;
}
export interface AiVisibility {
  checkedAt: string;
  model: string;
  mentionRate: number;
  citationRate: number;
  results: Array<{ prompt: string; mentioned: boolean; cited: boolean; competitors: string[]; citations: Array<{ url: string; title: string }>; error?: string }>;
}

export function useGrowthTools() {
  const { activeSiteId } = useSites();
  const queryClient = useQueryClient();
  const site = encodeURIComponent(activeSiteId || "");

  const audit = useMutation({
    mutationFn: (fresh: boolean) => api.post<SiteAudit>("/product-seo/audit", { siteId: activeSiteId, fresh }),
  });

  const rankKey = ["rankings", activeSiteId];
  const rankings = useQuery({
    queryKey: rankKey,
    queryFn: () => api.get<{ rankings: RankRow[]; serpConfigured: boolean }>(`/product-seo/rankings?siteId=${site}`),
    enabled: Boolean(activeSiteId),
  });
  const refreshRankings = () => queryClient.invalidateQueries({ queryKey: rankKey });
  const track = useMutation({
    mutationFn: (input: { keywords?: string[]; fromPlan?: boolean }) => api.post<{ added: number; skipped: number; limit: number }>("/product-seo/rankings/track", { siteId: activeSiteId, ...input }),
    onSuccess: refreshRankings,
  });
  const untrack = useMutation({
    mutationFn: (keyword: string) => api.post("/product-seo/rankings/untrack", { siteId: activeSiteId, keyword }),
    onSuccess: refreshRankings,
  });
  const checkRankings = useMutation({
    mutationFn: () => api.post<{ checked: number }>("/product-seo/rankings/check", { siteId: activeSiteId }),
    onSuccess: refreshRankings,
  });

  const visKey = ["ai-visibility", activeSiteId];
  const visibility = useQuery({
    queryKey: visKey,
    queryFn: () => api.get<{ visibility: AiVisibility | null }>(`/product-seo/ai-visibility?siteId=${site}`),
    enabled: Boolean(activeSiteId),
  });
  const checkVisibility = useMutation({
    mutationFn: (prompts?: string[]) => api.post<AiVisibility>("/product-seo/ai-visibility/check", { siteId: activeSiteId, prompts }),
    onSuccess: (data) => queryClient.setQueryData(visKey, { visibility: data }),
  });

  return { activeSiteId, audit, rankings, track, untrack, checkRankings, visibility, checkVisibility };
}
