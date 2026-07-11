import { describe, expect, it } from "vitest";
import { buildOrtakAlanMetadata, normalizeOrtakAlanForRequest, ortakAlanClientChecks } from "./ortak-alan-publishing";

describe("Ortak Alan publishing metadata", () => {
  it("restores persisted metadata before generated defaults", () => {
    const metadata = buildOrtakAlanMetadata({
      stored: { contentType: "Analiz", editorialOwner: "Ortak Alan", slug: "kalici-haber-metadata-alani" },
      slug: "generated-slug",
      excerpt: "Generated excerpt",
      metaTitle: "Generated title",
      metaDescription: "Generated description",
      tags: ["Teknoloji"],
    });
    expect(metadata.contentType).toBe("Analiz");
    expect(metadata.slug).toBe("kalici-haber-metadata-alani");
    expect(metadata.editorialOwner).toBe("Ortak Alan");
  });

  it("normalizes source URLs and sponsored content before sending", () => {
    const metadata = buildOrtakAlanMetadata({ slug: "slug", excerpt: "excerpt", metaTitle: "title", metaDescription: "description", tags: [] });
    metadata.contentType = "Sponsorlu İçerik";
    metadata.sources = [{ name: "Kaynak", url: "example.com/news", type: "Haber kaynağı", publishedAt: "2026-07-11", note: "" }];
    const normalized = normalizeOrtakAlanForRequest(metadata);
    expect(normalized.sponsored).toBe(true);
    expect(normalized.sources[0].url).toBe("https://example.com/news");
  });

  it("keeps draft gaps visible as failed checks", () => {
    const metadata = buildOrtakAlanMetadata({ slug: "short", excerpt: "", metaTitle: "", metaDescription: "", tags: [] });
    const checks = ortakAlanClientChecks(metadata, "Short title", false);
    expect(checks.some((check) => !check.ok)).toBe(true);
    expect(checks.find((check) => check.label === "Ghost yazarı")?.ok).toBe(false);
  });
});
