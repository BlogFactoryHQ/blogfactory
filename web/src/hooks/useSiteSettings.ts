import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const siteSettingsQueryKey = (siteId?: string | null) =>
  ["user-settings", siteId || "none"] as const;

export const siteSettingsPath = (siteId?: string | null) =>
  siteId ? `/settings?siteId=${encodeURIComponent(siteId)}` : "/settings";

interface UseSiteSettingsOptions<T> {
  enabled?: boolean;
  refetchInterval?: (settings: T | undefined) => number | false;
}

export function useSiteSettings<T>(
  siteId?: string | null,
  options: UseSiteSettingsOptions<T> = {},
) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => siteSettingsQueryKey(siteId), [siteId]);
  const query = useQuery({
    queryKey,
    queryFn: () => api.get<T>(siteSettingsPath(siteId)),
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval
      ? (result) => options.refetchInterval?.(result.state.data)
      : false,
  });

  const setSettingsCache = useCallback((settings: T) => {
    queryClient.setQueryData(queryKey, settings);
  }, [queryClient, queryKey]);

  const invalidateSettings = useCallback(() => {
    return queryClient.invalidateQueries({ queryKey: ["user-settings"] });
  }, [queryClient]);

  return {
    ...query,
    queryKey,
    setSettingsCache,
    invalidateSettings,
  };
}
