import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type DeploymentConfig = {
  signup_enabled: boolean;
  auth_provider?: "local" | "workos";
  cloud?: boolean;
  managed_ai_enabled?: boolean;
  turnstile_site_key?: string | null;
};

// Hosted Cloud and self-hosted instances share the web bundle; the public auth config says which one this is.
export function useDeploymentConfig() {
  const query = useQuery({
    queryKey: ["auth-config"],
    queryFn: async () => (await api.get<DeploymentConfig>("/auth/config")) ?? { signup_enabled: false },
    staleTime: Infinity,
    retry: false,
  });
  return {
    cloud: query.data?.cloud === true,
    managedAiEnabled: query.data?.managed_ai_enabled === true,
    isLoading: query.isLoading,
  };
}
