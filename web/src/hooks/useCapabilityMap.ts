import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, retryTransientApiError } from "@/lib/api";
import { capabilitySummary, evaluateCapabilities, nextUnlock, type RequirementState } from "@/lib/capabilities";
import type { WorkspaceDigest } from "@/lib/control-plane";

type ProviderState = { serp: boolean; volume: boolean; openai: boolean };

// Combines the workspace digest (account connections) with the server's provider flags into one readiness map.
export function useCapabilityMap(digest: WorkspaceDigest | undefined) {
  const providers = useQuery({
    queryKey: ["product-seo-capabilities"],
    queryFn: () => api.get<ProviderState>("/product-seo/capabilities"),
    retry: retryTransientApiError,
    staleTime: 60_000,
  });
  const results = useMemo(() => {
    if (!digest || !providers.data) return [];
    const state: RequirementState = {
      openrouter: digest.connections.generation.ready,
      openai: providers.data.openai,
      cms: digest.connections.cms.connected > 0,
      search_console: digest.connections.search_console.connected && digest.connections.search_console.status !== "unavailable",
      mcp: digest.connections.active > 0,
      serp: providers.data.serp,
      volume: providers.data.volume,
    };
    return evaluateCapabilities(state);
  }, [digest, providers.data]);
  return {
    results,
    summary: capabilitySummary(results),
    next: nextUnlock(results),
    isLoading: providers.isLoading,
    error: providers.error,
    refetch: providers.refetch,
  };
}
