import { describe, expect, it } from "vitest";
import { normalizeSeoSlugInput, seoErrorPresentation, seoReviewGuidance, seoStatusPresentation, seoWorkflowState, type SeoMetadata } from "./seo-metadata";

const metadata = (status: SeoMetadata["status"], source: "ai" | "manual" = "ai"): SeoMetadata => ({
  version: 1,
  status,
  sourceHash: "hash",
  slug: "meaningful-canonical-seo-slug",
  metaTitle: "A Complete Canonical Meta Title for Search Intent",
  metaDescription: "A complete canonical meta description explains the article promise clearly and remains inside the shared publishing contract for every CMS.",
  primaryQuery: "canonical metadata",
  searchIntent: "informational",
  language: "en",
  provenance: { slug: source, metaTitle: source, metaDescription: source, primaryQuery: source, searchIntent: source, language: source },
  manualReviewRequired: source === "manual",
  modelId: "test/model",
  generatedAt: "2026-07-16T00:00:00.000Z",
  validationErrors: [],
  error: null,
});

describe("SEO workflow state", () => {
  it("blocks pending and failed packages without silently approving them", () => {
    expect(seoWorkflowState(metadata("pending"), false)).toMatchObject({ canPublish: false, canRetry: true });
    expect(seoWorkflowState(metadata("failed"), false)).toMatchObject({ canPublish: false, canRetry: true });
  });

  it("separates stale manual confirmation from overwrite", () => {
    expect(seoWorkflowState(metadata("needs_review", "manual"), false)).toMatchObject({ canConfirm: true, canOverwrite: true, canPublish: false });
    expect(seoWorkflowState(metadata("needs_review"), false).canConfirm).toBe(false);
    expect(seoWorkflowState({ ...metadata("needs_review", "manual"), validationErrors: ["Invalid metadata"] }, false).canConfirm).toBe(false);
  });

  it("allows a valid user edit to be saved before publishing", () => {
    expect(seoWorkflowState(metadata("needs_review", "manual"), true)).toMatchObject({ canConfirm: false, canPublish: true });
  });

  it("explains review and failure states without implying fallback metadata", () => {
    expect(seoStatusPresentation("needs_review").description).toMatch(/no longer match.*see the reason/i);
    expect(seoStatusPresentation("failed").description).toMatch(/without creating fallback/i);
  });

  it("explains exactly why SEO needs review", () => {
    const stale = metadata("needs_review");
    expect(seoReviewGuidance(stale)).toMatchObject({ title: "SEO paketi eski yazı sürümüne ait" });
    expect(seoReviewGuidance({ ...stale, validationErrors: ["Meta title is too short."] })).toMatchObject({ title: "SEO doğrulama hatası var" });
    expect(seoReviewGuidance(metadata("needs_review", "manual"))?.description).toContain("meta başlık");
  });
});

describe("SEO slug input", () => {
  it("normalizes Turkish text into the canonical CMS-safe format", () => {
    expect(normalizeSeoSlugInput("  Şişli'de Çığ Öyküsü  ")).toBe("sisli-de-cig-oykusu");
  });
});

it("turns a missing OpenRouter key error into an actionable settings link", () => {
  expect(seoErrorPresentation("Add your OpenRouter API key before generating SEO metadata")).toEqual({
    message: "SEO üretimi için OpenRouter anahtarı gerekli.",
    settingsHref: "/control/article-settings?section=api-keys",
  });
});
