/* eslint-disable react-refresh/only-export-components */
import { createContext, ReactNode, useContext, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";

export interface Site {
  id: string;
  name: string;
  domain: string;
  sitemapUrl?: string | null;
  sitemap_url?: string | null;
  status: string;
  pageCount: number;
  page_count?: number;
  vectorCount: number;
  vector_count?: number;
  topics: string[];
  language?: string | null;
  cta?: string | null;
  internalLinkLastSyncedAt?: string | null;
  internal_link_last_synced_at?: string | null;
  createdAt?: string;
  created_at?: string;
  updatedAt?: string;
  updated_at?: string;
}

interface SitesResponse {
  sites: Site[];
  activeSiteId: string | null;
  active_site_id: string | null;
}

interface CreateSiteInput {
  url: string;
  name?: string;
}

interface SiteContextValue {
  sites: Site[];
  activeSite: Site | null;
  activeSiteId: string | null;
  isLoading: boolean;
  isCreating: boolean;
  isRefreshing: boolean;
  createSite: (input: CreateSiteInput) => Promise<Site>;
  activateSite: (siteId: string) => Promise<void>;
  refreshSite: (siteId: string) => Promise<Site>;
  deleteSite: (siteId: string) => Promise<void>;
}

const SiteContext = createContext<SiteContextValue | undefined>(undefined);

function normalizeSite(site: Site): Site {
  return {
    ...site,
    sitemapUrl: site.sitemapUrl ?? site.sitemap_url,
    pageCount: site.pageCount ?? site.page_count ?? 0,
    vectorCount: site.vectorCount ?? site.vector_count ?? 0,
    internalLinkLastSyncedAt: site.internalLinkLastSyncedAt ?? site.internal_link_last_synced_at,
    createdAt: site.createdAt ?? site.created_at,
    updatedAt: site.updatedAt ?? site.updated_at,
    topics: site.topics || [],
  };
}

export function SiteProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const sitesQuery = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const response = await api.get<SitesResponse>("/sites");
      return {
        sites: response.sites.map(normalizeSite),
        activeSiteId: response.activeSiteId ?? response.active_site_id,
      };
    },
    enabled: !!user && (user.role === "admin" || user.approvalStatus === "approved"),
  });

  const createSiteMutation = useMutation({
    mutationFn: async (input: CreateSiteInput) => {
      const response = await api.post<{ site: Site; activeSiteId: string; active_site_id: string }>("/sites", input);
      return normalizeSite(response.site);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  const activateSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      await api.post(`/sites/${siteId}/activate`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  const refreshSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      const response = await api.post<{ site: Site }>(`/sites/${siteId}/refresh`);
      return normalizeSite(response.site);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  const deleteSiteMutation = useMutation({
    mutationFn: async (siteId: string) => {
      await api.delete(`/sites/${siteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sites"] });
      queryClient.invalidateQueries({ queryKey: ["user-settings"] });
    },
  });

  const value = useMemo<SiteContextValue>(() => {
    const sites = sitesQuery.data?.sites || [];
    const activeSiteId = sitesQuery.data?.activeSiteId || null;
    const activeSite = sites.find((site) => site.id === activeSiteId) || sites[0] || null;

    return {
      sites,
      activeSite,
      activeSiteId,
      isLoading: sitesQuery.isLoading,
      isCreating: createSiteMutation.isPending,
      isRefreshing: refreshSiteMutation.isPending,
      createSite: async (input) => createSiteMutation.mutateAsync(input),
      activateSite: async (siteId) => { await activateSiteMutation.mutateAsync(siteId); },
      refreshSite: async (siteId) => refreshSiteMutation.mutateAsync(siteId),
      deleteSite: async (siteId) => { await deleteSiteMutation.mutateAsync(siteId); },
    };
  }, [
    sitesQuery.data,
    sitesQuery.isLoading,
    createSiteMutation,
    activateSiteMutation,
    refreshSiteMutation,
    deleteSiteMutation,
  ]);

  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSites() {
  const context = useContext(SiteContext);
  if (!context) throw new Error("useSites must be used within SiteProvider");
  return context;
}
