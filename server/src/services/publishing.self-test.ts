import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";

const { markdownToHtml } = await import("./publishing.js");

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
assert.match(html, /<li><strong>Agentik kodlama araçları kodlama bilmeyenleri tamamen ikame eder mi\?<\/strong><p>Hayır\./);
assert.match(html, /<ul><li>Yazılım mühendisleri yakın başarı oranlarına ulaşıyor\.<\/li><li>Fark daha çok uzmanlık derinliğinde ortaya çıkıyor\.<\/li><\/ul>/);
assert.match(html, /<h2>Sonuç<\/h2>/);

console.log("publishing self-check passed");
