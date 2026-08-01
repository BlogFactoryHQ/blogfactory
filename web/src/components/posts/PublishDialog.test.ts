import { describe, expect, it } from "vitest";
import { buildGenericPublishDefaults, buildPublishDefaults } from "./PublishDialog";
import { buildOrtakAlanMetadata, ortakAlanEditorialMetadata } from "./ortak-alan-publishing";

describe("publish defaults", () => {
  it("does not synthesize publish SEO fields from the article", () => {
    const defaults = buildPublishDefaults(
      [
        "# Biyolojik Veriye Erişim Neden Hâlâ İnsan Eliyle Yapılıyor?",
        "",
        "Biyolojik veri platformları araştırma ekipleri için kritik olsa da erişim süreçleri hâlâ çok fazla manuel kontrol gerektiriyor.",
      ].join("\n")
    );

    expect(defaults).toEqual({ excerpt: "Biyolojik veri platformları araştırma ekipleri için kritik olsa da erişim süreçleri hâlâ çok fazla manuel kontrol gerektiriyor." });
    expect(defaults).not.toHaveProperty("slug");
    expect(defaults).not.toHaveProperty("metaTitle");
    expect(defaults).not.toHaveProperty("metaDescription");
  });

  it("falls back to RSS feed tags when post metadata has none", () => {
    const defaults = buildGenericPublishDefaults(
      { profile: "generic", categories: ["Blog"] },
      { defaultTags: ["Movies", "Box Office"], defaultCategories: ["News"] },
    );

    expect(defaults.tags).toBe("Movies, Box Office");
    expect(defaults.categories).toBe("Blog");
  });

  it("caps inherited publish tags at the CMS limit", () => {
    const defaults = buildGenericPublishDefaults(
      { profile: "generic", tags: Array.from({ length: 11 }, (_, index) => `Tag ${index + 1}`) },
    );

    expect(defaults.tags).toBe("Tag 1, Tag 2, Tag 3, Tag 4, Tag 5, Tag 6, Tag 7, Tag 8");
  });

  it("keeps Ortak Alan excerpt generation separate from canonical SEO", () => {
    const defaults = buildPublishDefaults(`# Başlık\n\nİlk cümle tamamlandı. ${"İkinci cümle sınırı aşacak kadar uzun bir açıklama olarak devam ediyor ve henüz bitmiyor ".repeat(3)}`);
    const metadata = buildOrtakAlanMetadata({ ...defaults, tags: [] });
    expect(metadata.excerpt).toBe("İlk cümle tamamlandı.");
    expect(metadata).not.toHaveProperty("metaDescription");
  });

  it("keeps an unsplittable Ortak Alan description invalid", () => {
    const description = "Noktalama olmadan devam eden ve herhangi bir cümle sınırı sunmayan açıklama";
    const metadata = buildOrtakAlanMetadata({ excerpt: description, tags: [] });
    expect(metadata.excerpt).toBe(description);
  });

  it("does not duplicate canonical SEO fields inside publishing metadata", () => {
    const metadata = buildOrtakAlanMetadata({
      excerpt: "Bu editoryal özet tamamlanmış bir cümledir.",
      tags: ["Teknoloji"],
    });
    const editorial = ortakAlanEditorialMetadata(metadata);
    expect(editorial).not.toHaveProperty("slug");
    expect(editorial).not.toHaveProperty("metaTitle");
    expect(editorial).not.toHaveProperty("metaDescription");
  });
});
