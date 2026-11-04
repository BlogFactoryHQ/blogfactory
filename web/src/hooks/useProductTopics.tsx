import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSites } from "@/hooks/useSites";

export type TopicIntent = "informational" | "commercial" | "comparison" | "alternatives" | "transactional";

export interface ProductProfile {
  summary: string;
  audience: string[];
  problems: string[];
  features: string[];
  competitors: string[];
  seedTopics: string[];
  cta?: { label: string; description: string } | null;
  source: "ai" | "heuristic";
  pagesRead: string[];
}

export interface TopicCandidate {
  keyword: string;
  intent: TopicIntent;
  cluster: string;
  score: number;
  fit: number;
  sources: number;
  question: boolean;
  template: boolean;
  overlap: { title: string; similarity: number; method?: "title" | "embedding" } | null;
  volume?: number | null;
  competition?: string | null;
}

export interface KeywordResearch {
  keyword: string;
  questions: Array<{ question: string; word: string; depth: 1 | 2 }>;
  related: string[];
  serp: { provider: string; results: Array<{ title: string; url: string }>; brief: { targetWords: number; medianWords: number; sharedHeadings: Array<{ heading: string; pages: number }>; suggestedOutline: string[]; faq: string[]; terms?: Array<{ term: string; docs: number }> } } | null;
  notes: string[];
  serpConfigured: boolean;
  planBrief: PlanBrief;
  metrics?: { volume: number | null; competition: string | null; cpc: number | null } | null;
}

export interface CompetitorGap {
  competitor: string;
  sitemapUrls: number;
  contentUrls: number;
  covered: number;
  gaps: Array<{ topic: string; url: string; intent: TopicIntent; fit: number; cluster: string }>;
  notes: string[];
}

export interface PlanBrief {
  keyword: string;
  targetWords: number | null;
  outline: Array<{ level: 2 | 3; text: string }>;
  questions: string[];
  source: "serp" | "questions";
}

export interface KnowledgeState { saved: boolean; enabled: boolean }
export interface TopicSuggestions {
  checkedAt: string;
  newCount: number;
  topics: Array<{ keyword: string; intent: TopicIntent; cluster: string; score: number }>;
}
interface ProfileResponse {
  profile: ProductProfile | null;
  updatedAt: string | null;
  knowledge?: KnowledgeState;
  suggestions?: TopicSuggestions | null;
  suggestionsCheckedAt?: string | null;
}
interface DiscoverResponse { topics: TopicCandidate[]; queriesRun: number }

export function useProductTopics() {
  const { activeSiteId } = useSites();
  const queryClient = useQueryClient();
  const profileKey = ["product-profile", activeSiteId];
  const profile = useQuery({
    queryKey: profileKey,
    queryFn: () => api.get<ProfileResponse>(`/product-seo/profile?siteId=${encodeURIComponent(activeSiteId || "")}`),
    enabled: Boolean(activeSiteId),
  });
  const generateProfile = useMutation({
    mutationFn: () => api.post<ProfileResponse>("/product-seo/profile/generate", { siteId: activeSiteId }),
    onSuccess: (data) => queryClient.setQueryData(profileKey, data),
  });
  const saveProfile = useMutation({
    mutationFn: (next: ProductProfile) => api.put<ProfileResponse>("/product-seo/profile", { siteId: activeSiteId, profile: next }),
    onSuccess: (data) => queryClient.setQueryData(profileKey, data),
  });
  const fetchLlmsTxt = () => api.get<{ text: string }>(`/product-seo/llms-txt?siteId=${encodeURIComponent(activeSiteId || "")}`);
  const discover = useMutation({
    mutationFn: () => api.post<DiscoverResponse>("/product-seo/topics/discover", { siteId: activeSiteId }),
  });
  const research = useMutation({
    mutationFn: (keyword: string) => api.post<KeywordResearch>("/product-seo/keyword-research", { siteId: activeSiteId, keyword }),
  });
  const gaps = useMutation({
    mutationFn: (competitor: string) => api.post<CompetitorGap>("/product-seo/competitor-gaps", { siteId: activeSiteId, competitor }),
  });
  const refreshPlan = () => {
    queryClient.invalidateQueries({ queryKey: ["seo-growth-plan", activeSiteId] });
    queryClient.invalidateQueries({ queryKey: ["workspace-digest", activeSiteId] });
    queryClient.invalidateQueries({ queryKey: ["topical-map", activeSiteId] });
    queryClient.invalidateQueries({ queryKey: ["rankings", activeSiteId] });
  };
  const addToPlan = useMutation({
    mutationFn: (input: { keywords: string[]; briefs?: Record<string, PlanBrief> }) =>
      api.post("/product-seo/topics/plan", { siteId: activeSiteId, ...input }),
    onSuccess: refreshPlan,
  });
  const fillPlan = useMutation({
    mutationFn: () => api.post<{ picked: TopicCandidate[]; items: unknown[] }>("/product-seo/topics/fill-plan", { siteId: activeSiteId, limit: 12 }),
    onSuccess: refreshPlan,
  });
  const applyCta = useMutation({
    mutationFn: () => api.post<{ cta: { label: string; description: string; url: string }; total: number }>("/product-seo/cta/apply", { siteId: activeSiteId }),
  });
  const buildDatasets = useMutation({
    mutationFn: () => api.post<{ datasets: Array<{ id: string; name: string; templateId: string; rows: number }> }>("/product-seo/programmatic/datasets", { siteId: activeSiteId }),
  });
  const checkTopics = useMutation({
    mutationFn: () => api.post<TopicSuggestions>("/product-seo/topics/check", { siteId: activeSiteId }),
    onSuccess: (suggestions) => queryClient.setQueryData<ProfileResponse>(profileKey, (current) => current ? { ...current, suggestions, suggestionsCheckedAt: suggestions.checkedAt } : current),
  });
  const enableKnowledge = useMutation({
    mutationFn: () => api.post<KnowledgeState>("/product-seo/knowledge/enable", { siteId: activeSiteId }),
    onSuccess: (knowledge) => queryClient.setQueryData<ProfileResponse>(profileKey, (current) => current ? { ...current, knowledge } : current),
  });
  return { activeSiteId, profile, generateProfile, saveProfile, fetchLlmsTxt, discover, research, gaps, addToPlan, fillPlan, enableKnowledge, applyCta, buildDatasets, checkTopics };
}
