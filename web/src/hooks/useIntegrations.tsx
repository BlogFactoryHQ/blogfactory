import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { asArray } from "@/lib/api-shape";
import { useSites } from "@/hooks/useSites";

export type IntegrationProvider = "wordpress" | "ghost" | "wix" | "framer";

export interface SiteIntegration {
  id: string;
  siteId: string;
  site_id: string;
  provider: IntegrationProvider;
  displayName: string;
  display_name: string;
  status: "connected" | "error" | string;
  credentialHint: string | null;
  credential_hint: string | null;
  config: Record<string, unknown>;
  lastTestedAt: string | null;
  last_tested_at: string | null;
  lastTestResult: string | null;
  last_test_result: string | null;
  lastPublishAt: string | null;
  last_publish_at: string | null;
  createdAt: string;
  created_at: string;
}

export interface Publication {
  id: string;
  provider: IntegrationProvider;
  publishMode: "draft" | "publish" | string;
  publish_mode: "draft" | "publish" | string;
  status: string;
  externalId: string | null;
  external_id: string | null;
  externalUrl: string | null;
  external_url: string | null;
  errorMessage: string | null;
  error_message: string | null;
  publishedAt: string | null;
  published_at: string | null;
}

export interface GhostAuthor {
  id: string;
  email: string;
  slug: string;
  name: string;
  status: string;
}

interface IntegrationInput {
  id?: string;
  provider: IntegrationProvider;
  displayName?: string;
  credentials?: Record<string, string>;
  config?: Record<string, unknown>;
}

export function useIntegrations(siteId?: string | null) {
  const { activeSiteId } = useSites();
  const resolvedSiteId = siteId || activeSiteId;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["integrations", resolvedSiteId],
    queryFn: async () => {
      const params = resolvedSiteId ? `?siteId=${encodeURIComponent(resolvedSiteId)}` : "";
      const response = await api.get<{ integrations: SiteIntegration[] }>(`/integrations${params}`);
      return asArray<SiteIntegration>(response?.integrations);
    },
    enabled: !!resolvedSiteId,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["integrations", resolvedSiteId] });

  const saveIntegration = useMutation({
    mutationFn: async (input: IntegrationInput) => {
      if (!resolvedSiteId) throw new Error("Select a site first");
      const payload = { ...input, siteId: resolvedSiteId };
      if (input.id) {
        return api.put<{ integration: SiteIntegration }>(`/integrations/${input.id}`, payload);
      }
      return api.post<{ integration: SiteIntegration }>("/integrations", payload);
    },
    onSuccess: invalidate,
  });

  const testIntegration = useMutation({
    mutationFn: async (id: string) => api.post<{ success: boolean; message?: string; error?: string; integration: SiteIntegration }>(`/integrations/${id}/test`),
    onSuccess: invalidate,
  });

  const deleteIntegration = useMutation({
    mutationFn: async (id: string) => api.delete<{ success: boolean }>(`/integrations/${id}`),
    onSuccess: invalidate,
  });

  return {
    integrations: query.data || [],
    isLoading: query.isLoading,
    saveIntegration,
    testIntegration,
    deleteIntegration,
  };
}

export function useGhostAuthors(integrationId?: string | null, enabled = true) {
  const query = useQuery({
    queryKey: ["ghost-authors", integrationId],
    queryFn: async () => {
      const response = await api.get<{ authors: GhostAuthor[] }>(`/integrations/${integrationId}/authors`);
      return asArray<GhostAuthor>(response?.authors);
    },
    enabled: Boolean(integrationId && enabled),
    staleTime: 60_000,
  });
  return { authors: query.data || [], isLoading: query.isLoading, error: query.error };
}
