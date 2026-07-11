import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSites } from "@/hooks/useSites";

export type IndexingProvider = "indexnow" | "bing" | "google";

export interface IndexingIntegration {
  id: string;
  siteId: string;
  site_id: string;
  provider: IndexingProvider;
  displayName: string;
  display_name: string;
  status: "connected" | "error" | string;
  credentialStatus?: "usable" | "missing" | "undecryptable" | string;
  credential_status?: "usable" | "missing" | "undecryptable" | string;
  autoSubmit: boolean;
  auto_submit: boolean;
  credentialHint: string | null;
  credential_hint: string | null;
  config: Record<string, unknown>;
  lastTestedAt: string | null;
  last_tested_at: string | null;
  lastTestResult: string | null;
  last_test_result: string | null;
  lastSubmitAt: string | null;
  last_submit_at: string | null;
  createdAt: string;
  created_at: string;
}

export interface IndexingSubmission {
  id: string;
  provider: IndexingProvider | string;
  url: string;
  source: string;
  status: "accepted" | "failed" | "queued" | "skipped" | string;
  errorMessage: string | null;
  error_message: string | null;
  submittedAt: string | null;
  submitted_at: string | null;
  createdAt: string;
  created_at: string;
}

interface DashboardResponse {
  integrations: IndexingIntegration[];
  submissions: IndexingSubmission[];
  stats: { accepted: number; failed: number; queued: number; skipped: number };
}

interface SaveInput {
  id?: string;
  provider: IndexingProvider;
  displayName?: string;
  autoSubmit?: boolean;
  credentials?: Record<string, string>;
}

export function useIndexing(siteId?: string | null) {
  const { activeSiteId } = useSites();
  const resolvedSiteId = siteId || activeSiteId;
  const queryClient = useQueryClient();
  const queryKey = ["indexing", resolvedSiteId];

  const dashboard = useQuery({
    queryKey,
    queryFn: async () => {
      const params = resolvedSiteId ? `?siteId=${encodeURIComponent(resolvedSiteId)}` : "";
      return api.get<DashboardResponse>(`/indexing/dashboard${params}`);
    },
    enabled: !!resolvedSiteId,
    staleTime: 60_000,
    placeholderData: (previousData) => previousData,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const saveIntegration = useMutation({
    mutationFn: async (input: SaveInput) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      const payload = { ...input, siteId: resolvedSiteId };
      if (input.id) return api.put<{ integration: IndexingIntegration }>(`/indexing/integrations/${input.id}`, payload);
      return api.post<{ integration: IndexingIntegration }>("/indexing/integrations", payload);
    },
    onSuccess: invalidate,
  });

  const testIntegration = useMutation({
    mutationFn: async (id: string) => api.post<{ success: boolean; message?: string; error?: string; integration: IndexingIntegration }>(`/indexing/integrations/${id}/test`),
    onSuccess: invalidate,
  });

  const deleteIntegration = useMutation({
    mutationFn: async (id: string) => api.delete<{ success: boolean }>(`/indexing/integrations/${id}`),
    onSuccess: invalidate,
  });

  const submitUrls = useMutation({
    mutationFn: async (urls: string[]) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      return api.post<{ submitted: number; submissions: IndexingSubmission[] }>("/indexing/submit", { siteId: resolvedSiteId, urls });
    },
    onSuccess: invalidate,
  });

  const startGoogleOAuth = useMutation({
    mutationFn: async (input: { displayName?: string; autoSubmit?: boolean } = {}) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      const params = new URLSearchParams({
        siteId: resolvedSiteId,
        displayName: input.displayName || "Google",
        autoSubmit: String(input.autoSubmit ?? true),
      });
      return api.get<{ authUrl: string }>(`/indexing/oauth/start?${params}`);
    },
  });

  return {
    dashboard: dashboard.data,
    integrations: dashboard.data?.integrations || [],
    submissions: dashboard.data?.submissions || [],
    stats: dashboard.data?.stats || { accepted: 0, failed: 0, queued: 0, skipped: 0 },
    isLoading: dashboard.isLoading,
    saveIntegration,
    testIntegration,
    deleteIntegration,
    submitUrls,
    startGoogleOAuth,
  };
}
