import type { SplitImageConfig } from "@/components/content/ImageGenerationSettings";

export interface CostEstimate {
  postCount: number;
  textCost: number;
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
  imageConfig: SplitImageConfig;
  averageTokensPerPost?: number | null;
  aiFallbackEnabled?: boolean | null;
}): CostEstimate {
  const postCount = Math.max(1, Math.round(numberOr(input.postCount, 1)));
  const wordCount = numberOr(input.articleWordCount, 1500);
  const avgTokens = numberOr(input.averageTokensPerPost, 0);
  const estimatedTokens = avgTokens > 0 ? avgTokens : Math.max(2400, wordCount * 2.2);
  const promptTokens = estimatedTokens * 0.45;
  const completionTokens = estimatedTokens * 0.55;
  const textPricing = input.textModel?.rawPricing;
  const textPerPost = ((promptTokens / 1_000_000) * (textPricing?.prompt || 0))
    + ((completionTokens / 1_000_000) * (textPricing?.completion || 0))
    + (textPricing?.request || 0);

  const aiImages = input.aiFallbackEnabled !== false;
  const imagePrice = input.imageModel?.rawPricing.image || 0;
  const autoCoverHigh = input.imageModel?.id.startsWith("auto/") ? 0.04 : imagePrice;
  const coverPerPost = input.imageConfig.cover.enabled && aiImages ? imagePrice : 0;
  const coverHighPerPost = input.imageConfig.cover.enabled && aiImages ? Math.max(imagePrice, autoCoverHigh) : 0;
  const inlinePerPost = 0;

  const assumptions = [
    avgTokens > 0 ? "Text estimate uses recent average tokens per post." : "Text estimate uses article word count heuristic.",
    input.imageConfig.cover.enabled && aiImages ? "Cover uses the selected image model." : "Cover AI is off or stock-only.",
    input.imageConfig.inline.enabled && input.imageConfig.inline.count > 0 && aiImages
      ? "Inline images try free OpenRouter first, then stock."
      : "Inline AI spend is off or no inline images are selected.",
  ];

  const textCost = textPerPost * postCount;
  const coverImageCost = coverPerPost * postCount;
  const inlineImageCost = inlinePerPost * postCount;
  const totalExpected = textCost + coverImageCost + inlineImageCost;
  const totalHigh = (textPerPost + coverHighPerPost + inlinePerPost) * postCount;

  return {
    postCount,
    textCost,
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
