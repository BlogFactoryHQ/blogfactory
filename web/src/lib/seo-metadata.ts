export type SeoStatus = "missing" | "pending" | "ready" | "needs_review" | "failed";

export interface SeoMetadata {
  version: 1;
  status: Exclude<SeoStatus, "missing">;
  sourceHash: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  primaryQuery: string;
  searchIntent: string;
  language: string;
  provenance: {
    slug: "ai" | "manual";
    metaTitle: "ai" | "manual";
    metaDescription: "ai" | "manual";
    primaryQuery: "ai" | "manual";
    searchIntent: "ai" | "manual";
    language: "ai" | "manual";
  };
  manualReviewRequired: boolean;
  modelId: string | null;
  generatedAt: string | null;
  validationErrors: string[];
  error: string | null;
}

export interface SeoLimits {
  slugMin: number;
  slugMax: number;
  titleMin: number;
  titleMax: number;
  descriptionMin: number;
  descriptionMax: number;
}

const statusPresentation = {
  missing: { status: "warning", label: "SEO missing", description: "No canonical SEO package exists yet. Generate one before publishing." },
  pending: { status: "running", label: "SEO preparing", description: "AI is generating metadata from the latest saved article. You can keep editing while it runs." },
  ready: { status: "success", label: "SEO ready", description: "This package is valid and linked to the latest saved article version." },
  needs_review: { status: "warning", label: "SEO review", description: "The article changed after manual SEO edits. Confirm the preserved fields or regenerate everything." },
  failed: { status: "error", label: "SEO failed", description: "Generation stopped without creating fallback metadata. Retry keeps manual fields unchanged." },
} as const;

export function seoStatusPresentation(status: SeoStatus) {
  return statusPresentation[status];
}

export function normalizeSeoSlugInput(value: string) {
  return value
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (character) => ({
      ç: "c", Ç: "c", ğ: "g", Ğ: "g", ı: "i", İ: "i",
      ö: "o", Ö: "o", ş: "s", Ş: "s", ü: "u", Ü: "u",
    })[character] || character)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function seoErrorPresentation(value: string | null | undefined) {
  return /OpenRouter API key/i.test(value || "")
    ? { message: "SEO üretimi için OpenRouter anahtarı gerekli.", settingsHref: "/settings?section=api-keys" }
    : { message: value || "", settingsHref: null };
}

export function seoWorkflowState(metadata: SeoMetadata | null | undefined, dirty: boolean) {
  const hasManual = Boolean(metadata && Object.values(metadata.provenance).includes("manual"));
  return {
    canPublish: metadata?.status === "ready" || dirty,
    canConfirm: metadata?.status === "needs_review" && metadata.manualReviewRequired && hasManual && !dirty,
    canRetry: !metadata || metadata.status === "failed",
    canOverwrite: metadata?.status === "ready" || metadata?.status === "needs_review" || (metadata?.status === "failed" && hasManual),
  };
}
