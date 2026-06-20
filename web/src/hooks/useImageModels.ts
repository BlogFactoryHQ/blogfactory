import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ImageModelConstraints } from "@/lib/mock-data";

export interface LiveImageModel {
  id: string;
  name: string;
  provider: string;
  pricing: "free" | "low" | "medium" | "high";
  costInfo: string;
  description: string;
  apiProvider: "openrouter" | "google-ai-studio";
  isFree: boolean;
  limits: string | null;
  constraints: ImageModelConstraints | null;
  rawPricing: {
    prompt: number;
    completion: number;
    image: number;
    request: number;
  };
  contextLength: number | null;
  modalities?: {
    input: string[];
    output: string[];
  };
  created?: number | null;
  supportedParameters?: string[];
}

const GOOGLE_AI_STUDIO_MODEL: LiveImageModel = {
  id: "google-ai-studio/gemini-2.5-flash-image",
  name: "Gemini 2.5 Flash (Google AI Studio Direct)",
  provider: "google-ai-studio",
  pricing: "low",
  costInfo: "~$0.04 per image",
  description: "Direct Google AI Studio — lower latency, uses your own API key. Max ~1024px.",
  apiProvider: "google-ai-studio",
  isFree: false,
  limits: null,
  constraints: {
    resolutions: ["Web", "1K"],
    aspectRatios: ["1:1", "3:2", "4:3", "16:9", "9:16", "21:9", "2:3", "3:4", "4:5", "5:4"],
    maxDimensionPx: 1024,
  },
  rawPricing: { prompt: 0, completion: 0, image: 0.04, request: 0 },
  contextLength: null,
};

export async function fetchImageModels(refresh = false): Promise<LiveImageModel[]> {
  const models = await api.get<LiveImageModel[]>(`/models/image${refresh ? "?refresh=true" : ""}`);
  return [...(Array.isArray(models) ? models : []), GOOGLE_AI_STUDIO_MODEL];
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
