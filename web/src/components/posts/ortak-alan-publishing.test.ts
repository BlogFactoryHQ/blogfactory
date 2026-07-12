import { describe, expect, it } from "vitest";
import { buildOrtakAlanMetadata, completeSentenceWithinLimit, isMeaningfulTurkishAlt, normalizeOrtakAlanForRequest, ortakAlanClientChecks } from "./ortak-alan-publishing";

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

  it("normalizes malformed persisted arrays without crashing the editor", () => {
    const metadata = buildOrtakAlanMetadata({
      stored: { topicTags: "legacy" as never, sources: {} as never },
      slug: "generated-slug",
      excerpt: "Generated excerpt",
      metaTitle: "Generated title",
      metaDescription: "Generated description",
      tags: [" Teknoloji ", "Teknoloji"],
    });
    expect(metadata.topicTags).toEqual(["Teknoloji"]);
    expect(metadata.sources).toEqual([expect.objectContaining({ name: "", url: "" })]);
  });

  it("fills legacy inline image metadata from attached assets", () => {
    const metadata = buildOrtakAlanMetadata({
      slug: "generated-slug",
      excerpt: "Tamamlanmış bir açıklama cümlesidir.",
      metaTitle: "Generated title",
      metaDescription: "Tamamlanmış bir meta açıklama cümlesidir.",
      tags: ["Teknoloji"],
      inlineImageUrls: ["inline.webp"],
      imageAssets: [{ storage_path: "inline.webp", alt_text: "Renkli teknoloji çiziminde çalışan ekip üyeleri", provider: "openrouter", source_kind: "ai", source_url: null, credit: null, license_label: null }],
    });
    expect(metadata.inlineImages).toEqual([{ url: "inline.webp", alt: "Renkli teknoloji çiziminde çalışan ekip üyeleri" }]);
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

  it("validates source links and meaningful Turkish image alts", () => {
    const metadata = buildOrtakAlanMetadata({ slug: "yeterince-uzun-bir-haber-slug-alani", excerpt: "Bu açıklama gerekli uzunluğu karşılayan ve tamamlanmış bir Türkçe cümledir.", metaTitle: "Gerekli Uzunluğu Karşılayan Türkçe Meta Başlığı", metaDescription: "Bu meta açıklaması gerekli karakter aralığını karşılamak için yeterli ayrıntıyı verir ve tamamlanmış bir Türkçe cümle olarak biter.", tags: ["Teknoloji"] });
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
