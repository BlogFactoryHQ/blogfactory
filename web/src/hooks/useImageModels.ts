import { useQuery } from "@tanstack/react-query";
import { api, retryTransientApiError } from "@/lib/api";
import { asArray, asStringArray } from "@/lib/api-shape";
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
  return asArray<LiveImageModel>(models).map((model) => ({
    ...model,
    constraints: model.constraints ? {
      ...model.constraints,
      resolutions: asStringArray(model.constraints.resolutions).filter((value): value is "512" | "1K" => value === "512" || value === "1K"),
      aspectRatios: asStringArray(model.constraints.aspectRatios),
    } : null,
    modalities: model.modalities ? {
      input: asStringArray(model.modalities.input),
      output: asStringArray(model.modalities.output),
    } : undefined,
    supportedParameters: asStringArray(model.supportedParameters),
  }));
}

export function useImageModels() {
  return useQuery<LiveImageModel[]>({
    queryKey: ["image-models"],
    queryFn: () => fetchImageModels(),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: retryTransientApiError,
  });
}
