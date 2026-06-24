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

    expect(defaults.slug).toBe("biyolojik-veriye-erisim-neden-hala-insan-eliyle-yapiliyor");
    expect(defaults.metaTitle).toBe("Biyolojik Veriye Erişim Neden Hâlâ İnsan Eliyle Yapılıyor?");
    expect(defaults.metaDescription).toMatch(/Biyolojik veri platformları/);
  });
});
