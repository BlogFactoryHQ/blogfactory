import { describe, expect, it } from "vitest";
import { buildPublishDefaults } from "./PublishDialog";

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
});
