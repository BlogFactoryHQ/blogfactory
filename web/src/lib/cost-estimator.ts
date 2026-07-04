import type { SplitImageConfig } from "@/components/content/ImageGenerationSettings";

export interface CostEstimate {
  postCount: number;
  textCost: number;
  textCostPerPost: number;
  promptTokensPerPost: number;
  completionTokensPerPost: number;
  promptCostPerPost: number;
  completionCostPerPost: number;
  requestCostPerPost: number;
  promptPricePerMillion: number;
  completionPricePerMillion: number;
  coverImageCost: number;
  inlineImageCost: number;
  totalLow: number;
  totalExpected: number;
  totalHigh: number;
  assumptions: string[];
}

interface PricedModel {
  id: string;
  rawPricing: {
    prompt: number;
    completion: number;
    image?: number;
    request?: number;
    imageByResolution?: Partial<Record<"512" | "1K", number>>;
  };
}

const numberOr = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export function estimateGenerationCost(input: {
  postCount: number;
  articleWordCount?: number | null;
  textModel?: PricedModel | null;
  imageModel?: PricedModel | null;
  inlineImageModel?: PricedModel | null;
  imageConfig: SplitImageConfig;
  averageTokensPerPost?: number | null;
  inlineImageSource?: "ai" | "stock" | string | null;
  imageDeliveryMode?: "generate" | "manual_prompt" | string | null;
}): CostEstimate {
  const postCount = Math.max(1, Math.round(numberOr(input.postCount, 1)));
  const wordCount = numberOr(input.articleWordCount, 1500);
  const avgTokens = numberOr(input.averageTokensPerPost, 0);
  const estimatedTokens = avgTokens > 0 ? avgTokens : Math.max(2400, wordCount * 2.2);
  const promptTokens = estimatedTokens * 0.45;
  const completionTokens = estimatedTokens * 0.55;
  const textPricing = input.textModel?.rawPricing;
  const promptPrice = textPricing?.prompt || 0;
  const completionPrice = textPricing?.completion || 0;
  const requestPrice = textPricing?.request || 0;
  const promptCostPerPost = (promptTokens / 1_000_000) * promptPrice;
  const completionCostPerPost = (completionTokens / 1_000_000) * completionPrice;
  const textPerPost = promptCostPerPost + completionCostPerPost + requestPrice;

  const manualPromptMode = input.imageDeliveryMode === "manual_prompt";
  const inlineUsesAi = input.inlineImageSource !== "stock";
  const coverResolution = input.imageConfig.cover.resolution === "512" ? "512" : "1K";
  const inlineResolution = input.imageConfig.inline.resolution === "512" ? "512" : "1K";
  const imagePrice = input.imageModel?.rawPricing.imageByResolution?.[coverResolution] || input.imageModel?.rawPricing.image || 0;
  const inlineImagePrice = input.inlineImageModel?.rawPricing.imageByResolution?.[inlineResolution] || input.inlineImageModel?.rawPricing.image || 0;
  const coverPerPost = input.imageConfig.cover.enabled && !manualPromptMode ? imagePrice : 0;
  const coverHighPerPost = input.imageConfig.cover.enabled && !manualPromptMode ? imagePrice : 0;
  const inlinePerPost = input.imageConfig.inline.enabled && inlineUsesAi && !manualPromptMode ? inlineImagePrice * input.imageConfig.inline.count : 0;

  const assumptions = [
    avgTokens > 0 ? "Text estimate uses recent average tokens per post." : "Text estimate uses article word count heuristic.",
    manualPromptMode
      ? "Manual image mode creates Midjourney prompt slots at $0 image generation cost."
      : input.imageConfig.cover.enabled ? "Cover uses the OpenRouter image model." : "Cover image is off.",
    manualPromptMode
      ? "Cover and inline image generation are skipped until a manual image is imported."
      : !input.imageConfig.inline.enabled || input.imageConfig.inline.count === 0
      ? "Inline images are off."
      : inlineUsesAi
        ? "Inline images use the OpenRouter image model."
        : "Inline images use stock providers at $0 image generation cost.",
  ];

  const textCost = textPerPost * postCount;
  const coverImageCost = coverPerPost * postCount;
  const inlineImageCost = inlinePerPost * postCount;
  const totalExpected = textCost + coverImageCost + inlineImageCost;
  const totalHigh = (textPerPost + coverHighPerPost + inlinePerPost) * postCount;

  return {
    postCount,
    textCost,
    textCostPerPost: textPerPost,
    promptTokensPerPost: promptTokens,
    completionTokensPerPost: completionTokens,
    promptCostPerPost,
    completionCostPerPost,
    requestCostPerPost: requestPrice,
    promptPricePerMillion: promptPrice,
    completionPricePerMillion: completionPrice,
    coverImageCost,
    inlineImageCost,
    totalLow: textCost,
    totalExpected,
    totalHigh: Math.max(totalExpected, totalHigh),
    assumptions,
  };
}

export function shouldWarnForCost(input: {
  estimate: CostEstimate;
  monthlyBudget?: number | null;
  currentMonthSpend?: number;
  openRouterRemaining?: number | null;
}) {
  const projected = input.estimate.totalHigh || input.estimate.totalExpected;
  if (projected > 1) return true;
  if (input.estimate.postCount >= 20) return true;
  if (input.monthlyBudget && input.currentMonthSpend != null && input.currentMonthSpend + projected >= input.monthlyBudget * 0.8) return true;
  if (input.openRouterRemaining != null && input.openRouterRemaining > 0 && projected >= input.openRouterRemaining * 0.8) return true;
  return false;
}
