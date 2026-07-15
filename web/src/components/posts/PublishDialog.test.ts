import { describe, expect, it } from "vitest";
import { buildGenericPublishDefaults, buildPublishDefaults } from "./PublishDialog";
import { buildOrtakAlanMetadata } from "./ortak-alan-publishing";

describe("publish defaults", () => {
  it("fills publish SEO fields when generated content has no meta block", () => {
    const defaults = buildPublishDefaults(
      "Biyolojik Veriye Erişim Neden Hâlâ İnsan Eliyle Yapılıyor?",
      [
        "# Biyolojik Veriye Erişim Neden Hâlâ İnsan Eliyle Yapılıyor?",
        "",
        "Biyolojik veri platformları araştırma ekipleri için kritik olsa da erişim süreçleri hâlâ çok fazla manuel kontrol gerektiriyor.",
      ].join("\n")
    );

    expect(defaults.slug).toBe("biyolojik-veriye-erisim-neden-hala");
    expect(defaults.metaTitle).toBe("Biyolojik Veriye Erişim Neden Hâlâ İnsan Eliyle Yapılıyor?");
    expect(defaults.metaDescription).toMatch(/Biyolojik veri platformları/);
  });

  it("prefers the generated article H1 over an English source title", () => {
    const defaults = buildPublishDefaults(
      "Who really invented the internet...?",
      [
        "# İnterneti Gerçekten Kim İcat Etti?",
        "",
        "İnternetin hikayesi tek bir mucidin değil, farklı dönemlerde çalışan araştırmacıların ortak çabasının sonucudur.",
      ].join("\n")
    );

    expect(defaults.slug).toBe("interneti-gercekten-kim-icat-etti");
    expect(defaults.metaTitle).toBe("İnterneti Gerçekten Kim İcat Etti?");
  });

  it("uses generated SEO metadata limits", () => {
    const defaults = buildPublishDefaults(
      "Fallback title",
      [
        "## Slug",
        "search backed seo metadata packaging plan",
        "",
        "## Meta Title",
        "Search-Backed SEO Metadata for Blog Drafts",
        "",
        "## Meta Description",
        "Create search-backed SEO metadata for blog drafts with long-tail keyword research and People Also Ask FAQ ideas. Start improving publish-ready content today.",
        "",
        "# Search-Backed SEO Metadata",
        "",
        "Body copy.",
      ].join("\n")
    );

    expect(defaults.slug).toBe("search-backed-seo-metadata-packaging");
    expect(defaults.metaTitle).toBe("Search-Backed SEO Metadata for Blog Drafts");
    expect(defaults.metaDescription.length).toBeLessThanOrEqual(145);
    expect(defaults.metaDescription).toMatch(/People Also Ask/);
  });

  it("falls back to RSS feed tags when post metadata has none", () => {
    const defaults = buildGenericPublishDefaults(
      "Feed story",
      "# Feed story\n\nBody copy.",
      null,
      { profile: "generic", categories: ["Blog"] },
      { defaultTags: ["Movies", "Box Office"], defaultCategories: ["News"] },
    );

    expect(defaults.tags).toBe("Movies, Box Office");
    expect(defaults.categories).toBe("Blog");
  });

  it("uses complete sentences for Ortak Alan fallback descriptions", () => {
    const defaults = buildPublishDefaults("Başlık", `# Başlık\n\nİlk cümle tamamlandı. ${"İkinci cümle sınırı aşacak kadar uzun bir açıklama olarak devam ediyor ve henüz bitmiyor ".repeat(3)}`);
    const metadata = buildOrtakAlanMetadata({ ...defaults, tags: [] });
    expect(metadata.excerpt).toBe("İlk cümle tamamlandı.");
    expect(metadata.metaDescription).toBe("İlk cümle tamamlandı.");
  });

  it("keeps an unsplittable Ortak Alan description invalid", () => {
    const description = "Noktalama olmadan devam eden ve herhangi bir cümle sınırı sunmayan açıklama";
    const metadata = buildOrtakAlanMetadata({ slug: "slug", excerpt: description, metaTitle: "title", metaDescription: description, tags: [] });
    expect(metadata.excerpt).toBe(description);
    expect(metadata.metaDescription).toBe(description);
  });
});
