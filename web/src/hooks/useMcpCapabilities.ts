import { useQuery } from "@tanstack/react-query";
import { api, retryTransientApiError } from "@/lib/api";

export type McpCapabilities = { tools: string[]; tool_count: number; endpoint: string; oauth_enabled: boolean };

export function useMcpCapabilities() {
  return useQuery({
    queryKey: ["mcp-capabilities"],
    queryFn: () => api.get<McpCapabilities>("/mcp/capabilities"),
    retry: retryTransientApiError,
    staleTime: 60_000,
  });
}
