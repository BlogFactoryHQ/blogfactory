import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";
process.env.API_KEY_ENCRYPTION_SECRET ||= "publishing-self-test-secret";

const { decryptSecret, encryptSecret } = await import("./api-keys.js");
const { appendBrandCta, articleBody, encryptProviderCredentials, ghostErrorMessage, ghostPostFields, markdownToHtml, markdownToWixRichContent, slugify } = await import("./publishing.js");
const { appendOrtakAlanDisclosures, normalizeOrtakAlanMetadata, ortakAlanTags, validateOrtakAlanMetadata } = await import("./ortak-alan-publishing.js");

const ortakAlanMetadata = normalizeOrtakAlanMetadata({
  contentType: "Haber",
  slug: "openai-yeni-yapay-zeka-modelini-duyurdu",
  excerpt: "OpenAI, yeni yapay zeka modelini resmi açıklamasıyla duyurdu ve ürünün temel yeteneklerini kamuoyuyla paylaştı.",
  metaTitle: "OpenAI Yeni Yapay Zeka Modelini Resmen Duyurdu",
  metaDescription: "OpenAI, yeni yapay zeka modelini resmi açıklamasıyla duyurdu; modelin yetenekleri, kullanım alanları ve erişim takvimi hakkında ayrıntılar paylaşıldı.",
  topicTags: ["Yapay Zeka", "OpenAI", "Yapay Zeka"],
  sources: [{ name: "OpenAI", url: "openai.com/news", type: "Resmi açıklama", publishedAt: "2026-07-11", note: "Ürün duyurusu" }],
  author: { id: "author-id", email: "bora@example.com", slug: "bora", name: "Bora Gökçe" },
  editorialOwner: "Ortak Alan",
  aiAssisted: true,
  aiUsageNote: "Kaynak tarama ve taslak hazırlamada yapay zeka kullanıldı; son kontrol editör tarafından yapıldı.",
  image: { alt: "OpenAI ürün duyurusunu temsil eden görsel", source: "OpenAI", license: "Basın kullanımı", aiGenerated: false },
});
assert.deepEqual(ortakAlanTags(ortakAlanMetadata), ["Haber", "Yapay Zeka", "OpenAI"]);
const disclosureHtml = appendOrtakAlanDisclosures("<p>Gövde</p>", ortakAlanMetadata);
assert.match(disclosureHtml, /class="source-note"/);
assert.match(disclosureHtml, /rel="nofollow noopener"/);
assert.match(disclosureHtml, /class="editorial-note"/);
assert.match(disclosureHtml, /kg-card-begin: html/);
assert.equal((appendOrtakAlanDisclosures(disclosureHtml, ortakAlanMetadata).match(/class="source-note"/g) || []).length, 1);
assert.equal(validateOrtakAlanMetadata(ortakAlanMetadata, { mode: "publish", title: "OpenAI Yeni Yapay Zeka Modelini Resmen Duyurdu", hasCoverImage: true, authorMatched: true }).errors.length, 0);
assert.equal(validateOrtakAlanMetadata({ ...ortakAlanMetadata, sources: [] }, { mode: "draft", title: "OpenAI Yeni Yapay Zeka Modelini Resmen Duyurdu", hasCoverImage: true, authorMatched: true }).errors.length, 0);
assert.match(validateOrtakAlanMetadata({ ...ortakAlanMetadata, author: null }, { mode: "draft", title: "OpenAI Yeni Yapay Zeka Modelini Resmen Duyurdu", hasCoverImage: true, authorMatched: false }).errors[0], /Ghost yazarı/);
const ghostFields = ghostPostFields({
  title: "OpenAI Yeni Yapay Zeka Modelini Resmen Duyurdu",
  html: disclosureHtml,
  slug: ortakAlanMetadata.slug,
  excerpt: ortakAlanMetadata.excerpt,
  metaTitle: ortakAlanMetadata.metaTitle,
  metaDescription: ortakAlanMetadata.metaDescription,
  tags: ortakAlanTags(ortakAlanMetadata),
  authorId: "author-id",
  coverImageUrl: "https://example.com/cover.jpg",
  coverAltText: ortakAlanMetadata.image.alt,
  coverCaption: "Görsel: OpenAI · Lisans: Basın kullanımı",
} as never, "draft", "https://ghost.example/cover.jpg") as Record<string, unknown>;
assert.deepEqual(ghostFields.authors, [{ id: "author-id" }]);
assert.equal(ghostFields.feature_image_alt, ortakAlanMetadata.image.alt);
assert.equal(ghostFields.feature_image_caption, "Görsel: OpenAI · Lisans: Basın kullanımı");

const html = markdownToHtml([
  "# Agentik Kodlama",
  "",
  "Bu konuda daha fazla içerik için **[Yapay Zeka ile Dijital Pazarlama Rehberi](/blog/yapay-zeka-dijital-pazarlama)** yazısını inceleyebilirsiniz.",
  "",
  "Benzer şekilde [external kaynak](https://example.com/path?a=1&b=2) faydalı olabilir.",
  "",
  "## Sık Sorulan Sorular",
  "",
  "### Agentik kodlama araçları kodlama bilmeyenleri tamamen ikame eder mi?",
  "Hayır. Araştırma, alan uzmanlığının başarıyı doğrudan etkilediğini gösteriyor.",
  "",
  "### Başarı oranı meslek grupları arasında ne kadar farklılaşıyor?",
  "- Yazılım mühendisleri yakın başarı oranlarına ulaşıyor.",
  "- Fark daha çok uzmanlık derinliğinde ortaya çıkıyor.",
  "",
  "## Sonuç",
  "",
  "İçerik planlaması net bir yayın akışıyla daha güçlü çalışır.",
].join("\n"));

assert.match(html, /<a href="\/blog\/yapay-zeka-dijital-pazarlama">Yapay Zeka ile Dijital Pazarlama Rehberi<\/a>/);
assert.match(html, /<a href="https:\/\/example\.com\/path\?a=1&amp;b=2">external kaynak<\/a>/);
assert.match(html, /<h2>Sık Sorulan Sorular<\/h2>\n<ul class="faq-list">/);
assert.doesNotMatch(html, /<h3>Agentik kodlama araçları/);
assert.match(html, /<li><p><strong>Agentik kodlama araçları kodlama bilmeyenleri tamamen ikame eder mi\?<\/strong><\/p><p>Hayır\./);
assert.match(html, /<ul><li>Yazılım mühendisleri yakın başarı oranlarına ulaşıyor\.<\/li><li>Fark daha çok uzmanlık derinliğinde ortaya çıkıyor\.<\/li><\/ul>/);
assert.match(html, /<h2>Sonuç<\/h2>/);
const tableHtml = markdownToHtml([
  "Tablo / Bilgi",
  "",
  "| Yöntem | Çevrim Süresi | Birim Maliyet |",
  "| --- | --- | --- |",
  "| Plastik Enjeksiyon | 15-40 sn | Düşük |",
  "| 3D Baskı | 5-15 dk | Yüksek |",
].join("\n"));
assert.match(tableHtml, /<table><thead><tr><th>Yöntem<\/th><th>Çevrim Süresi<\/th><th>Birim Maliyet<\/th><\/tr><\/thead>/);
assert.doesNotMatch(tableHtml, /\| --- \|/);
assert.equal(articleBody("# Başlık\n\n# Başlık\n\n## Başlık\n\nGövde"), "Gövde");
assert.equal(slugify("Farklı Sektörlerde Havalandırma Tapası Kullanımı: Otomotivden Elektroniğe"), "farkli-sektorlerde-havalandirma-tapasi-kullanimi");
const ctaResult = appendBrandCta("Intro\n\nBody", [{
  label: "İletişime Geç:",
  description: "sinangokce@idealplastik.com.tr +90 212 612 68 40 / 41 İstanbul - Türkiye",
  url: "https://idealplastik.com.tr/iletisim",
}]);
assert.match(ctaResult.markdown, /## İletişime Geç:/);
assert.match(ctaResult.markdown, /\[İletişime Geç:]\(https:\/\/idealplastik\.com\.tr\/iletisim\)/);
assert.equal(ctaResult.cta?.label, "İletişime Geç:");
const duplicateCtaResult = appendBrandCta(ctaResult.markdown, [{
  label: "İletişime Geç:",
  description: "sinangokce@idealplastik.com.tr +90 212 612 68 40 / 41 İstanbul - Türkiye",
  url: "https://idealplastik.com.tr/iletisim",
}]);
assert.equal(duplicateCtaResult.cta, null);
assert.equal(duplicateCtaResult.markdown, ctaResult.markdown);
assert.throws(
  () => encryptProviderCredentials("wix", { apiKey: "token", siteId: "site" }),
  /Wix API key, site ID, and author\/member ID are required/,
);
assert.doesNotThrow(() => encryptProviderCredentials("wix", { apiKey: "token", siteId: "site", memberId: "member" }));
assert.doesNotThrow(() =>
  encryptProviderCredentials(
    "wix",
    { memberId: "member" },
    { credentialsEncrypted: encryptSecret(JSON.stringify({ apiKey: "token", siteId: "site" })) } as never,
  ),
);
process.env.API_KEY_ENCRYPTION_SECRET = "old-publishing-secret";
const staleGhostCredentials = encryptSecret(JSON.stringify({ url: "https://old.example", adminApiKey: `${"a".repeat(24)}:${"b".repeat(64)}` }));
process.env.API_KEY_ENCRYPTION_SECRET = "publishing-self-test-secret";
const replacedGhostCredentials = encryptProviderCredentials(
  "ghost",
  { url: "https://new.example", adminApiKey: `${"c".repeat(24)}:${"d".repeat(64)}` },
  { credentialsEncrypted: staleGhostCredentials } as never,
);
assert.deepEqual(JSON.parse(decryptSecret(replacedGhostCredentials.encrypted)), {
  url: "https://new.example",
  adminApiKey: `${"c".repeat(24)}:${"d".repeat(64)}`,
});
assert.equal(
  await ghostErrorMessage(new Response("<!DOCTYPE html><title>Just a moment...</title><p>cloudflare</p>", { status: 403, headers: { "cf-ray": "test" } }), "Ghost test"),
  "Ghost test failed: 403. Cloudflare blocked the Ghost Admin API. Allow /ghost/api/admin/* in Cloudflare, then try again.",
);
const wixRichContent = markdownToWixRichContent(
  "Intro paragraph\n\n![Article image](stored/image.webp)\n\n## Details",
  null,
  new Map([["stored/image.webp", { id: "wix-media-id", url: "https://static.wixstatic.com/media/wix-media-id", width: 1200, height: 675 }]]),
) as { nodes: Array<{ type: string; imageData?: { image?: { src?: { id?: string } } }; nodes?: Array<{ textData?: { text?: string } }> }> };
assert.equal(wixRichContent.nodes.some((node) => node.type === "IMAGE" && node.imageData?.image?.src?.id === "wix-media-id"), true);
assert.equal(JSON.stringify(wixRichContent).includes("![Article image]"), false);
const wixRichContentWithUrls = markdownToWixRichContent(
  "![Article image](stored/image.webp)",
  null,
  new Map([["stored/image.webp", { id: "wix-media-id", url: "https://static.wixstatic.com/media/wix-media-id", width: 1200, height: 675 }]]),
  "url",
) as { nodes: Array<{ type: string; imageData?: { image?: { src?: { url?: string } } } }> };
assert.equal(wixRichContentWithUrls.nodes[0].imageData?.image?.src?.url, "https://static.wixstatic.com/media/wix-media-id");
const wixRichContentWithoutImages = markdownToWixRichContent(
  "Intro\n\n![Article image](stored/image.webp)\n\nAfter",
  { id: "cover-media-id", url: "https://static.wixstatic.com/media/cover", width: 1200, height: 675 },
  new Map([["stored/image.webp", { id: "wix-media-id", url: "https://static.wixstatic.com/media/wix-media-id", width: 1200, height: 675 }]]),
  "none",
) as { nodes: Array<{ type: string }> };
assert.equal(wixRichContentWithoutImages.nodes.some((node) => node.type === "IMAGE"), false);
assert.equal(JSON.stringify(wixRichContentWithoutImages).includes("![Article image]"), false);
const wixRichContentWithInlineFormatting = markdownToWixRichContent(
  "## Sık Sorulan Sorular\n\n**Havalandırma tapası ne sıklıkla değiştirilmelidir?**\n\nDaha fazla bilgi için [kaynağı inceleyin](https://example.com).",
  null,
) as { nodes: Array<{ nodes?: Array<{ textData?: { text?: string; decorations?: Array<{ type?: string }> } }> }> };
const wixRichFormattingJson = JSON.stringify(wixRichContentWithInlineFormatting);
assert.equal(wixRichFormattingJson.includes("**Havalandırma"), false);
assert.equal(wixRichFormattingJson.includes("[kaynağı inceleyin]"), false);
assert.equal(
  wixRichContentWithInlineFormatting.nodes.some((node) =>
    node.nodes?.some((child) =>
      child.textData?.text === "Havalandırma tapası ne sıklıkla değiştirilmelidir?"
      && child.textData.decorations?.some((decoration) => decoration.type === "BOLD")
    )
  ),
  true,
);
const wixRichContentWithStructure = markdownToWixRichContent(
  [
    "First line of one paragraph",
    "second line continues it.",
    "",
    "### Deep heading",
    "",
    "- First **bold** item",
    "- Second item",
    "",
    "1. Ordered item",
    "",
    "> Quoted [source](https://example.com/source)",
  ].join("\n"),
  null,
) as {
  nodes: Array<{
    type: string;
    headingData?: { level?: number };
    nodes?: Array<{
      type?: string;
      nodes?: Array<{ type?: string; nodes?: Array<{ textData?: { text?: string; decorations?: Array<{ type?: string }> } }> }>;
      textData?: { text?: string; decorations?: Array<{ type?: string }> };
    }>;
  }>;
};
assert.equal(
  wixRichContentWithStructure.nodes.some((node) =>
    node.type === "PARAGRAPH"
    && node.nodes?.some((child) => child.textData?.text === "First line of one paragraph second line continues it.")
  ),
  true,
);
assert.equal(wixRichContentWithStructure.nodes.some((node) => node.type === "HEADING" && node.headingData?.level === 4), true);
assert.equal(
  wixRichContentWithStructure.nodes.some((node) =>
    node.type === "PARAGRAPH"
    && node.nodes?.some((child) => child.textData?.text === " ")
  ),
  true,
);
const bulletList = wixRichContentWithStructure.nodes.find((node) => node.type === "BULLETED_LIST");
assert.equal(bulletList?.nodes?.every((item) => item.type === "LIST_ITEM" && item.nodes?.[0]?.type === "PARAGRAPH"), true);
assert.equal(
  JSON.stringify(bulletList).includes("- First"),
  false,
);
assert.equal(wixRichContentWithStructure.nodes.some((node) => node.type === "ORDERED_LIST"), true);
const quote = wixRichContentWithStructure.nodes.find((node) => node.type === "BLOCKQUOTE");
assert.equal(quote?.nodes?.[0]?.type, "PARAGRAPH");
assert.equal(JSON.stringify(quote).includes("[source]"), false);
const wixRichContentWithTable = markdownToWixRichContent(
  [
    "Tablo / Bilgi",
    "",
    "| Yöntem | Çevrim Süresi | Birim Maliyet |",
    "| --- | --- | --- |",
    "| Plastik Enjeksiyon | 15-40 sn | Düşük |",
    "| 3D Baskı | 5-15 dk | Yüksek |",
  ].join("\n"),
  null,
) as {
  nodes: Array<{
    type: string;
    htmlData?: { html?: string; source?: string; autoHeight?: boolean; containerData?: { width?: { custom?: string }; alignment?: string; textWrap?: boolean } };
    nodes?: Array<{
      type?: string;
      nodes?: Array<{ type?: string; nodes?: Array<{ type?: string; textData?: { text?: string } }> }>;
    }>;
  }>;
};
const table = wixRichContentWithTable.nodes.find((node) => node.type === "HTML");
assert.equal(table?.htmlData?.source, "HTML");
assert.equal(table?.htmlData?.autoHeight, true);
assert.equal(table?.htmlData?.containerData?.width?.custom, "842");
assert.equal(table?.htmlData?.containerData?.alignment, "CENTER");
assert.equal(table?.htmlData?.containerData?.textWrap, false);
assert.match(table?.htmlData?.html || "", /font-family:Arial,Helvetica,sans-serif/);
assert.match(table?.htmlData?.html || "", /<table style="[^"]*border-collapse:collapse/);
assert.match(table?.htmlData?.html || "", /<th style="[^"]*background:#f3f4f6[^"]*">Yöntem<\/th>/);
assert.equal(JSON.stringify(table).includes("| Yöntem |"), false);
assert.equal(JSON.stringify(table).includes("Plastik Enjeksiyon"), true);
const wixRichContentWithTableFallback = markdownToWixRichContent(
  [
    "| Yöntem | Çevrim Süresi | Birim Maliyet |",
    "| --- | --- | --- |",
    "| Plastik Enjeksiyon | 15-40 sn | Düşük |",
  ].join("\n"),
  null,
  new Map(),
  "id",
  "text",
) as { nodes: Array<{ type: string; nodes?: Array<{ nodes?: Array<{ nodes?: Array<{ textData?: { text?: string } }> }> }> }> };
const fallbackTable = wixRichContentWithTableFallback.nodes.find((node) => node.type === "BULLETED_LIST");
assert.equal(JSON.stringify(fallbackTable).includes("| Yöntem |"), false);
assert.equal(JSON.stringify(fallbackTable).includes("Çevrim Süresi: 15-40 sn"), true);

console.log("publishing self-check passed");
