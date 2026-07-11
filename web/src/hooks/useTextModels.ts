import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { asArray, asStringArray } from "@/lib/api-shape";

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
    webSearch?: number;
  };
  contextLength: number | null;
  modalities?: {
    input: string[];
    output: string[];
  };
  created?: number | null;
  supportedParameters?: string[];
}

export async function fetchTextModels(refresh = false): Promise<LiveTextModel[]> {
  const models = await api.get<LiveTextModel[]>(`/models/text${refresh ? "?refresh=true" : ""}`);
  return asArray<LiveTextModel>(models).map((model) => ({
    ...model,
    modalities: model.modalities ? {
      input: asStringArray(model.modalities.input),
      output: asStringArray(model.modalities.output),
    } : undefined,
    supportedParameters: asStringArray(model.supportedParameters),
  }));
}

export function useTextModels() {
  return useQuery<LiveTextModel[]>({
    queryKey: ["text-models"],
    queryFn: () => fetchTextModels(),
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: 2,
  });
}
