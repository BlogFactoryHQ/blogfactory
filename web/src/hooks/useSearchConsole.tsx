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
  credentialHint: string | null;
  credential_hint: string | null;
  lastTestedAt: string | null;
  last_tested_at: string | null;
  lastTestResult: string | null;
  last_test_result: string | null;
  lastSyncAt: string | null;
  last_sync_at: string | null;
}

interface DashboardResponse {
  integration: SearchConsoleIntegration | null;
  stats: { pageCount: number; queryCount: number; clicks: number; impressions: number };
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
  });

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
      queryClient.invalidateQueries({ queryKey: ["optimize-pages", resolvedSiteId] });
    },
  });

  const startOAuth = useMutation({
    mutationFn: async (propertyUrl: string) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      const params = new URLSearchParams({ siteId: resolvedSiteId, propertyUrl });
      return api.get<{ authUrl: string }>(`/search-console/oauth/start?${params}`);
    },
  });

  return {
    dashboard: dashboard.data,
    integration: dashboard.data?.integration || null,
    stats: dashboard.data?.stats || { pageCount: 0, queryCount: 0, clicks: 0, impressions: 0 },
    isLoading: dashboard.isLoading,
    saveIntegration,
    testIntegration,
    deleteIntegration,
    sync,
    startOAuth,
  };
}
