import { describe, expect, it } from "vitest";
import { buildOrtakAlanMetadata, completeSentenceWithinLimit, isMeaningfulTurkishAlt, normalizeOrtakAlanForRequest, ortakAlanClientChecks } from "./ortak-alan-publishing";

describe("Ortak Alan publishing metadata", () => {
  it("restores editorial metadata without carrying legacy SEO fields", () => {
    const metadata = buildOrtakAlanMetadata({
      stored: { contentType: "Analiz", editorialOwner: "Ortak Alan", slug: "legacy-slug" } as never,
      excerpt: "Generated excerpt",
      tags: ["Teknoloji"],
    });
    expect(metadata.contentType).toBe("Analiz");
    expect(metadata.editorialOwner).toBe("Ortak Alan");
    expect(metadata).not.toHaveProperty("slug");
  });

  it("normalizes malformed persisted arrays without crashing the editor", () => {
    const metadata = buildOrtakAlanMetadata({
      stored: { topicTags: "legacy" as never, sources: {} as never },
      excerpt: "Generated excerpt",
      tags: [" Teknoloji ", "Teknoloji"],
    });
    expect(metadata.topicTags).toEqual(["Teknoloji"]);
    expect(metadata.sources).toEqual([expect.objectContaining({ name: "", url: "" })]);
  });

  it("fills legacy inline image metadata from attached assets", () => {
    const metadata = buildOrtakAlanMetadata({
      excerpt: "Tamamlanmış bir açıklama cümlesidir.",
      tags: ["Teknoloji"],
      inlineImageUrls: ["inline.webp"],
      imageAssets: [{ storage_path: "inline.webp", alt_text: "Renkli teknoloji çiziminde çalışan ekip üyeleri", provider: "openrouter", source_kind: "ai", source_url: null, credit: null, license_label: null }],
    });
    expect(metadata.inlineImages).toEqual([{ url: "inline.webp", alt: "Renkli teknoloji çiziminde çalışan ekip üyeleri" }]);
  });

  it("normalizes source URLs and sponsored content before sending", () => {
    const metadata = buildOrtakAlanMetadata({ excerpt: "excerpt", tags: [] });
    metadata.contentType = "Sponsorlu İçerik";
    metadata.sources = [{ name: "Kaynak", url: "example.com/news", type: "Haber kaynağı", publishedAt: "2026-07-11", note: "" }];
    const normalized = normalizeOrtakAlanForRequest(metadata);
    expect(normalized.sponsored).toBe(true);
    expect(normalized.sources[0].url).toBe("https://example.com/news");
  });

  it("keeps draft gaps visible as failed checks", () => {
    const metadata = buildOrtakAlanMetadata({ excerpt: "", tags: [] });
    const checks = ortakAlanClientChecks(metadata, "Short title", false);
    expect(checks.some((check) => !check.ok)).toBe(true);
    expect(checks.find((check) => check.label === "Ghost yazarı")?.ok).toBe(false);
  });

  it("validates source links and meaningful Turkish image alts", () => {
    const metadata = buildOrtakAlanMetadata({ excerpt: "Bu açıklama gerekli uzunluğu karşılayan ve tamamlanmış bir Türkçe cümledir.", tags: ["Teknoloji"] });
    metadata.sources = [{ name: "Kaynak", url: "https://example.com/news", type: "", publishedAt: "", note: "" }];
    metadata.image = { alt: "Trump kürsüde gazetecilerin sorularını yanıtlıyor", source: "Reuters", license: "Editoryal kullanım", aiGenerated: false };
    expect(ortakAlanClientChecks(metadata, "Trump Basın Özgürlüğünü Sıkıştırıyor: Times Gazetecilerine Davetiye", true).find((check) => check.label === "Kaynaklar")?.ok).toBe(true);
    expect(isMeaningfulTurkishAlt("Featured image for Trump")).toBe(false);
    expect(isMeaningfulTurkishAlt(metadata.image.alt)).toBe(true);
  });

  it("shortens only at complete sentence boundaries", () => {
    expect(completeSentenceWithinLimit("İlk cümle bitti. İkinci cümle sınırı aşacak kadar uzundur.", 20)).toBe("İlk cümle bitti.");
    expect(completeSentenceWithinLimit("Tamamlanmamış çok uzun açıklama", 10)).toBe("Tamamlanmamış çok uzun açıklama");
  });
});
