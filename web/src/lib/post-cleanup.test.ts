import { describe, expect, it } from "vitest";
import { cleanGeneratedPostContent, cleanPostTitle } from "./post-cleanup";

describe("post cleanup", () => {
  it("removes trailing AI meta notes without touching the article", () => {
    const dirty = [
      "Başlık",
      "",
      "Bu paragraf kalmalı.",
      "",
      "(Toplam kelime sayısı yaklaşık 1480’dir. Yukarıdaki bağlantılar doğal bağlam içinde 6 adet iç link olarak yerleştirilmiştir.)",
    ].join("\n");

    expect(cleanGeneratedPostContent(dirty)).toBe("Başlık\n\nBu paragraf kalmalı.");
  });

  it("normalizes escaped markdown pipes in plain titles", () => {
    expect(cleanPostTitle("Natural Language Autoencoders \\| Anthropic")).toBe("Natural Language Autoencoders | Anthropic");
  });
});
