import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSites } from "@/hooks/useSites";
import type { TopicSuggestions } from "@/hooks/useProductTopics";

type ProfileSignals = { profile: { summary: string } | null; suggestions?: TopicSuggestions | null };

// Same query key and endpoint as useProductTopics, so the sidebar, Overview and the Topics view share one cached read.
export function useGrowthSignals() {
  const { activeSiteId } = useSites();
  const query = useQuery({
    queryKey: ["product-profile", activeSiteId],
    queryFn: () => api.get<ProfileSignals>(`/product-seo/profile?siteId=${encodeURIComponent(activeSiteId || "")}`),
    enabled: Boolean(activeSiteId),
    staleTime: 5 * 60_000,
  });
  const suggestions = query.data?.suggestions ?? null;
  return {
    isLoading: query.isLoading,
    /** True once the product has been analyzed. */
    analyzed: Boolean(query.data?.profile),
    suggestions,
    /** Topics found since the previous weekly check. */
    newTopics: suggestions?.newCount ?? 0,
  };
}
