import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ImageModelConstraints } from "@/lib/types";

export interface LiveImageModel {
  id: string;
  name: string;
  provider: string;
  pricing: "free" | "low" | "medium" | "high";
  costInfo: string;
  description: string;
  apiProvider: "openrouter";
  isFree: boolean;
  limits: string | null;
  constraints: ImageModelConstraints | null;
  rawPricing: {
    prompt: number;
    completion: number;
    image: number;
    request: number;
    webSearch?: number;
    imageByResolution?: Partial<Record<"512" | "1K", number>>;
  };
  contextLength: number | null;
  modalities?: {
    input: string[];
    output: string[];
  };
  created?: number | null;
  supportedParameters?: string[];
}

export async function fetchImageModels(refresh = false): Promise<LiveImageModel[]> {
  const models = await api.get<LiveImageModel[]>(`/models/image${refresh ? "?refresh=true" : ""}`);
  return Array.isArray(models) ? models : [];
}

export function useImageModels() {
  return useQuery<LiveImageModel[]>({
    queryKey: ["image-models"],
    queryFn: fetchImageModels,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 2,
  });
}
