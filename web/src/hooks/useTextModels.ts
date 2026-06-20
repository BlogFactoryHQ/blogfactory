import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface LiveTextModel {
  id: string;
  name: string;
  provider: string;
  pricing: "free" | "low" | "medium" | "high";
  costInfo: string;
  description: string;
  isFree: boolean;
  limits: string | null;
  rawPricing: {
    prompt: number;
    completion: number;
    request: number;
  };
  contextLength: number | null;
}

async function fetchTextModels(): Promise<LiveTextModel[]> {
  const models = await api.get<any[]>("/models/text");
  return Array.isArray(models) ? models : [];
}

export function useTextModels() {
  return useQuery<LiveTextModel[]>({
    queryKey: ["text-models"],
    queryFn: fetchTextModels,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 2,
  });
}
