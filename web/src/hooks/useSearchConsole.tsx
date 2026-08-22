import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSites } from "@/hooks/useSites";

export interface SearchConsoleIntegration {
  id: string;
  siteId: string;
  site_id: string;
  propertyUrl: string;
  property_url: string;
  status: "connected" | "error" | string;
  credentialStatus?: "usable" | "missing" | "undecryptable" | string;
  credential_status?: "usable" | "missing" | "undecryptable" | string;
  credentialHint: string | null;
  credential_hint: string | null;
  lastTestedAt: string | null;
  last_tested_at: string | null;
  lastTestResult: string | null;
  last_test_result: string | null;
  lastSyncAt: string | null;
  last_sync_at: string | null;
  syncMetadata?: { first_incomplete_date?: string } | null;
  sync_metadata?: { first_incomplete_date?: string } | null;
}

export interface SearchConsoleProperty {
  siteUrl: string;
  permissionLevel: string;
}

export interface SearchConsoleInspectionResult {
  verdict: string;
  coverageState: string | null;
  robotsTxtState: string | null;
  indexingState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
  crawledAs: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  richResultsVerdict: string | null;
  inspectionResultLink: string | null;
}

export interface SearchConsoleInspection {
  url: string;
  result: SearchConsoleInspectionResult;
  inspectedAt: string;
  cached: boolean;
  stale: boolean;
  warning?: string;
}

export interface SearchConsoleAnalyticsResponse {
  input: { range: 7 | 28 | 90; compare: boolean; groupBy: string; searchType: string; country?: string; device?: string; includePreliminary?: boolean };
  range: { startDate: string; endDate: string; baselineStart: string | null; baselineEnd: string | null };
  totals: { clicks: MetricDelta; impressions: MetricDelta; ctr: MetricDelta; position: MetricDelta };
  daily: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>;
  rows: Array<{ label: string; clicks: number; impressions: number; ctr: number; position: number; deltaClicks: number | null; deltaPosition: number | null }>;
  metadata: { first_incomplete_date?: string } | null;
  provenance: SearchConsoleProvenance;
  cached: boolean;
}

export interface SearchConsoleProvenance {
  source: "google_search_console_api";
  property: string;
  scope: "site_total";
  fetched_at: string;
  complete_through: string;
  first_incomplete_date: string | null;
  data_status: "complete" | "preliminary";
  cache: "live" | "cached" | "mixed" | "stale";
}

export interface SearchConsoleOpportunityScope {
  scope: "page_query_rows";
  page_count: number;
  query_count: number;
  row_count: number;
  last_synced_at: string | null;
}

export interface SearchConsoleSitemap {
  path: string;
  type: "index" | "sitemap";
  isPending: boolean;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  errors: number;
  warnings: number;
  contents: Array<{ type?: string; submitted?: string | number; indexed?: string | number }>;
}

interface DashboardResponse {
  integration: SearchConsoleIntegration | null;
  range: { startDate: string; endDate: string; baselineStart: string | null; baselineEnd: string | null };
  stats: { pageCount: number; queryCount: number; clicks: number; impressions: number; ctr: number; position: number };
  totals: { clicks: MetricDelta; impressions: MetricDelta; ctr: MetricDelta; position: MetricDelta };
  opportunity_scope: SearchConsoleOpportunityScope;
  provenance: SearchConsoleProvenance | null;
}

export interface MetricDelta {
  value: number;
  baseline: number | null;
  delta: number | null;
  deltaPercent: number | null;
}

export type InsightKind = "risk" | "ctr" | "lift" | "improved" | "watch";

export interface SearchInsightRow {
  label: string;
  pageUrl?: string;
  query?: string;
  value: number;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  deltaClicks: number | null;
  deltaPosition: number | null;
  kind: InsightKind;
}

export interface SearchOpportunityBubble {
  label: string;
  value: number;
  kind: "risk" | "ctr" | "lift" | "improved";
  size: "sm" | "md" | "lg";
}

export interface SearchConsoleInsights {
  integration: SearchConsoleIntegration | null;
  range: {
    latestStart: string;
    latestEnd: string;
    baselineStart: string | null;
    baselineEnd: string | null;
  };
  totals: {
    clicks: MetricDelta;
    impressions: MetricDelta;
    ctr: MetricDelta;
    position: MetricDelta;
  };
  daily: Array<{ date: string; clicks: number; impressions: number; ctr: number; position: number }>;
  opportunityBubbles: SearchOpportunityBubble[];
  actionRows: {
    protectTraffic: SearchInsightRow[];
    liftCtr: SearchInsightRow[];
    strikingDistance: SearchInsightRow[];
  };
  topPages: SearchInsightRow[];
  topQueries: SearchInsightRow[];
  segments: {
    needsAttention: number;
    ctrOpportunities: number;
    strikingDistance: number;
    improved: number;
  };
  opportunity_scope: SearchConsoleOpportunityScope;
  provenance: SearchConsoleProvenance | null;
}

interface SaveInput {
  id?: string;
  propertyUrl: string;
  credentials?: Record<string, string>;
}

export function useSearchConsole(siteId?: string | null) {
  const { activeSiteId } = useSites();
  const resolvedSiteId = siteId || activeSiteId;
  const queryClient = useQueryClient();
  const queryKey = ["search-console", resolvedSiteId];

  const dashboard = useQuery({
    queryKey,
    queryFn: async () => {
      const params = resolvedSiteId ? `?siteId=${encodeURIComponent(resolvedSiteId)}` : "";
      return api.get<DashboardResponse>(`/search-console/dashboard${params}`);
    },
    enabled: !!resolvedSiteId,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });
  const integration = dashboard.data?.integration || null;

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveIntegration = useMutation({
    mutationFn: async (input: SaveInput) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      const payload = { ...input, siteId: resolvedSiteId };
      if (input.id) return api.put<{ integration: SearchConsoleIntegration }>(`/search-console/integrations/${input.id}`, payload);
      return api.post<{ integration: SearchConsoleIntegration }>("/search-console/integrations", payload);
    },
    onSuccess: invalidate,
  });

  const testIntegration = useMutation({
    mutationFn: async (id: string) => api.post<{ success: boolean; message?: string; integration: SearchConsoleIntegration }>(`/search-console/integrations/${id}/test`),
    onSuccess: invalidate,
  });

  const deleteIntegration = useMutation({
    mutationFn: async (id: string) => api.delete<{ success: boolean }>(`/search-console/integrations/${id}`),
    onSuccess: invalidate,
  });

  const sync = useMutation({
    mutationFn: async () => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      return api.post<{ synced: number; optimizePages: number }>("/search-console/sync", { siteId: resolvedSiteId });
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["search-console-insights", resolvedSiteId] });
      queryClient.invalidateQueries({ queryKey: ["optimize-pages", resolvedSiteId] });
    },
  });

  const startOAuth = useMutation({
    mutationFn: async (propertyUrl?: string) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      const params = new URLSearchParams({ siteId: resolvedSiteId });
      if (propertyUrl?.trim()) params.set("propertyUrl", propertyUrl.trim());
      return api.get<{ authUrl: string }>(`/search-console/oauth/start?${params}`);
    },
  });

  const properties = useQuery({
    queryKey: ["search-console-properties", resolvedSiteId],
    queryFn: async () => api.get<{ properties: SearchConsoleProperty[] }>(`/search-console/properties?siteId=${encodeURIComponent(resolvedSiteId || "")}`),
    enabled: Boolean(resolvedSiteId && integration),
    staleTime: 5 * 60_000,
  });

  const selectProperty = useMutation({
    mutationFn: async (propertyUrl: string) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      return api.post<{ integration: SearchConsoleIntegration }>("/search-console/property", { siteId: resolvedSiteId, propertyUrl });
    },
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["search-console-properties", resolvedSiteId] });
    },
  });

  return {
    dashboard: dashboard.data,
    integration,
    stats: dashboard.data?.stats || { pageCount: 0, queryCount: 0, clicks: 0, impressions: 0, ctr: 0, position: 0 },
    isLoading: dashboard.isLoading,
    saveIntegration,
    testIntegration,
    deleteIntegration,
    sync,
    startOAuth,
    properties: properties.data?.properties || [],
    propertiesLoading: properties.isLoading,
    selectProperty,
  };
}

export function useSearchConsoleInsights(siteId?: string | null) {
  const { activeSiteId } = useSites();
  const resolvedSiteId = siteId || activeSiteId;

  return useQuery({
    queryKey: ["search-console-insights", resolvedSiteId],
    queryFn: async () => {
      const params = resolvedSiteId ? `?siteId=${encodeURIComponent(resolvedSiteId)}` : "";
      return api.get<SearchConsoleInsights>(`/search-console/insights${params}`);
    },
    enabled: !!resolvedSiteId,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });
}

export function useSearchConsoleToolkit(siteId?: string | null) {
  const { activeSiteId } = useSites();
  const resolvedSiteId = siteId || activeSiteId;

  const inspect = useMutation({
    mutationFn: async ({ url, force = false }: { url: string; force?: boolean }) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      return api.post<SearchConsoleInspection>("/search-console/inspect", { siteId: resolvedSiteId, url, force });
    },
  });

  const inspectBatch = useMutation({
    mutationFn: async ({ urls, force = false }: { urls: string[]; force?: boolean }) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      return api.post<{ results: Array<({ ok: true } & SearchConsoleInspection) | { ok: false; url: string; error: string }>; inspected: number; failed: number }>(
        "/search-console/inspect/batch",
        { siteId: resolvedSiteId, urls, force },
      );
    },
  });

  const analytics = useMutation({
    mutationFn: async (input: {
      range: 7 | 28 | 90;
      compare: boolean;
      groupBy: "page" | "query" | "country" | "device";
      searchType: "web" | "image" | "video" | "news";
      country?: string;
      device?: "DESKTOP" | "MOBILE" | "TABLET";
      limit?: number;
      includePreliminary?: boolean;
    }) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      return api.post<SearchConsoleAnalyticsResponse>("/search-console/analytics/query", { siteId: resolvedSiteId, ...input });
    },
  });

  const sitemaps = useQuery({
    queryKey: ["search-console-sitemaps", resolvedSiteId],
    queryFn: async () => api.get<{ items: SearchConsoleSitemap[]; cached: boolean }>(`/search-console/sitemaps?siteId=${encodeURIComponent(resolvedSiteId || "")}`),
    enabled: Boolean(resolvedSiteId),
    retry: false,
    staleTime: 15 * 60_000,
  });

  return { inspect, inspectBatch, analytics, sitemaps };
}
