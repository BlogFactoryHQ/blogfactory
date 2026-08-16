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
  needs_review: { status: "warning", label: "SEO review", description: "The saved article and SEO package no longer match. Open SEO / Publish to see the reason and resolve it." },
  failed: { status: "error", label: "SEO failed", description: "Generation stopped without creating fallback metadata. Retry keeps manual fields unchanged." },
} as const;

export function seoStatusPresentation(status: SeoStatus) {
  return statusPresentation[status];
}

export function seoReviewGuidance(metadata?: SeoMetadata | null) {
  if (metadata?.status !== "needs_review") return null;
  if (metadata.validationErrors.length) return {
    title: "SEO doğrulama hatası var",
    description: "Ayrıntı aşağıdaki kırmızı hata mesajında gösteriliyor. İlgili alanı düzeltip SEO değişikliklerini kaydedin.",
  };
  const manualFields = ([
    ["slug", "URL slug"],
    ["metaTitle", "meta başlık"],
    ["metaDescription", "meta açıklama"],
  ] as const).filter(([field]) => metadata.provenance[field] === "manual").map(([, label]) => label);
  if (metadata.manualReviewRequired && manualFields.length) return {
    title: "Manuel SEO alanları yeniden onay bekliyor",
    description: `Yazı değişti. Korunan ${manualFields.join(", ")} alanlarını aşağıda kontrol edin; doğruysa onaylayın, değilse yeniden üretin.`,
  };
  return {
    title: "SEO paketi eski yazı sürümüne ait",
    description: "Yazı, bu paket oluşturulduktan sonra değişti. Aşağıdaki URL slug, meta başlık ve meta açıklama eski sürüme ait olabilir; güncel yazıdan yeniden üretin.",
  };
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
    canConfirm: metadata?.status === "needs_review" && metadata.manualReviewRequired && hasManual && !metadata.validationErrors.length && !dirty,
    canRetry: !metadata || metadata.status === "pending" || metadata.status === "failed",
    canOverwrite: metadata?.status === "ready" || metadata?.status === "needs_review" || (metadata?.status === "failed" && hasManual),
  };
}
