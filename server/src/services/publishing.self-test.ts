import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";
process.env.API_KEY_ENCRYPTION_SECRET ||= "publishing-self-test-secret";

const { encryptSecret } = await import("./api-keys.js");
const { articleBody, encryptProviderCredentials, markdownToHtml, markdownToWixRichContent } = await import("./publishing.js");

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
assert.equal(articleBody("# Başlık\n\n# Başlık\n\n## Başlık\n\nGövde"), "Gövde");
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

console.log("publishing self-check passed");
