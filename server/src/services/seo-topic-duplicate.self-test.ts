import assert from "node:assert/strict";
import {
  applyGenerationOverrides,
  articleTemplateInstructions,
  buildArticleExtras,
  buildSettingsInstructions,
  buildWriterSystemPrompt,
  findIndexedTopicDuplicate,
  resolveGenerationContract,
} from "./generation-contracts.js";
import {
  anchorGeneratedTitleToSource,
  buildGenerationContractMetadata,
  enforceGeneratedArticleContracts,
  evaluateSeoQa,
  generatedPostTitle,
  openRouterErrorMessage,
} from "./generation-output.js";
import { expandDraftVariations, feedCandidateItemCount, feedSourceItemCount } from "./generation-sources.js";
import { cleanGeneratedPostContent, cleanPostTitle } from "./post-cleanup.js";
import { publishTags, publishTitle, slugify, truncateAtWord } from "./publishing.js";

const match = findIndexedTopicDuplicate({
  internalLinkIndex: {
    pages: [
      { title: "How to Create a SaaS Content Calendar", path: "/blog/saas-content-calendar", url: "https://example.com/blog/saas-content-calendar" },
    ],
  },
}, "saas content calendar");

assert.equal(match?.path, "/blog/saas-content-calendar");
assert.equal(findIndexedTopicDuplicate({ internalLinkIndex: { pages: [{ title: "Pricing", path: "/pricing" }] } }, "seo strategy"), null);
assert.match(articleTemplateInstructions("comparison"), /at-a-glance table/);
assert.deepEqual(
  expandDraftVariations([{ title: "Source", content: "Content" }], "url", 3).map((article) => article.variationIndex),
  [1, 2, 3]
);
assert.match(
  anchorGeneratedTitleToSource("# Ortak Alan olarak\n\nBody", "Mythos Preview’un İstismar Geliştirme Yeteneği: Yeni Benchmarklar"),
  /^# Mythos Preview’un İstismar Geliştirme Yeteneği: Yeni Benchmarklar/
);
assert.match(
  anchorGeneratedTitleToSource("# Mythos Preview exploit benchmark sonuçları\n\nBody", "Mythos Preview’un İstismar Geliştirme Yeteneği: Yeni Benchmarklar"),
  /^# Mythos Preview exploit benchmark sonuçları/
);
assert.match(
  anchorGeneratedTitleToSource(
    "# İnternetin gerçek mucitleri kimlerdi?\n\nİnterneti kim buldu sorusuna genellikle tek bir isim verildiğini düşünürsünüz.",
    "Who really invented the internet...?",
    "Turkish"
  ),
  /^# İnternetin gerçek mucitleri kimlerdi\?/
);
assert.match(
  anchorGeneratedTitleToSource(
    "# Tracee Ellis Ross New York'a Dönüyor\n\nTracee Ellis Ross, Broadway sahnesinden sonra New York sokaklarında yeni bir döneme başlıyor.",
    "Tracee Ellis Ross Is Back in New York City, Living a Dream Come True"
  ),
  /^# Tracee Ellis Ross New York'a Dönüyor/
);
assert.equal(cleanPostTitle("Apple, MacBook ve iPad fiyatlarına zam yaptı - Webrazzi"), "Apple, MacBook ve iPad fiyatlarına zam yaptı");
assert.equal(cleanPostTitle("Apple, MacBook ve iPad fiyatlarına zam yaptı - Webrazzi:"), "Apple, MacBook ve iPad fiyatlarına zam yaptı");
assert.equal(cleanPostTitle("Meta, yeni yapay zeka destekli akıllı gözlük serisini tanıttı - Swipeline"), "Meta, yeni yapay zeka destekli akıllı gözlük serisini tanıttı");
const cleanedRepeatedConclusion = cleanGeneratedPostContent(`# İnternet Gerçekten Kimin İşi?

## Sonuç

İnternet, onlarca yıl süren işbirlikçi bir çabanın ürünüdür. Vint Cerf ve Bob Kahn, TCP/IP protokolünü geliştirerek internetin temel iletişim altyapısını oluşturmuştur.

İnternet, onlarca yıl süren işbirlikçi bir çabanın ürünüdür. Bu bağlamda, internetin doğuşu tek bir mucidin eseri değildir. İnternet, onlarca yıl süren işbirlikçi bir çabanın ürünüdür.

Not: Bu içerik, internetin doğuşuna dair tarihsel gerçekleri sunarak okuyucuyu internetin tek bir mucidin eseri olmadığını anlamaya yönlendirmek için hazırlanmıştır.

Bu yazı, internetin doğuşuna dair yaygın inanışları irdeleyerek okuyucuyu internetin tek bir mucidin eseri olmadığını anlamaya yönlendirmiştir.
`);
assert.equal((cleanedRepeatedConclusion.match(/İnternet, onlarca yıl süren işbirlikçi bir çabanın ürünüdür/g) || []).length, 1);
assert.doesNotMatch(cleanedRepeatedConclusion, /^Not: Bu içerik/m);
assert.doesNotMatch(cleanedRepeatedConclusion, /hazırlanmıştır/);
assert.doesNotMatch(cleanedRepeatedConclusion, /okuyucuyu.*yönlendirmiştir/);
const cleanedCutoffSection = cleanGeneratedPostContent(`# Rust

## Rust'ın Güvenlik Modeli

Rust'ın en belirgin özellikleri, bellek yönetimi ve performans arasındaki dengenin ne kadar önemli olduğunu göstermesidir. Rust, bellek yönetimi ve performans arasındaki dengenin ne kadar önemli olduğunu gösteren bir modeldir. Rust, bellek yönetimi ve performans arasındaki dengenin ne kadar önemli olduğunu gösteren bir modeldir.

Rust, bellek yönetimi ve performans arasındaki dengenin ne kadar önemli olduğunu gösteren bir modeldir. Rust, bellek yönetimi ve performans arasındaki dengenin ne kadar önemli olduğunu gösteren bir modeldir.

## Rust'ın 2020'lerin Yeni Dili Olması

Rust, 2020'lerin yeni dili olarak kabul ed

## Sık Sorulan Sorular
`);
assert.equal((cleanedCutoffSection.match(/Rust, bellek yönetimi ve performans arasındaki dengenin ne kadar önemli olduğunu gösteren bir modeldir/g) || []).length, 1);
assert.doesNotMatch(cleanedCutoffSection, /kabul ed\s*(?:\n|$)/);
assert.match(cleanedCutoffSection, /## Sık Sorulan Sorular/);
assert.equal(cleanGeneratedPostContent(`## SSS

### **Kimi modeline nasıl ulaşılır?

** Moonshot AI'nin sitesinden.`), `## SSS

### Kimi modeline nasıl ulaşılır?

Moonshot AI'nin sitesinden.`);
assert.deepEqual(
  expandDraftVariations([{ title: "Source", content: "Content" }], "url", 1, { index: 4, count: 5 }).map((article) => [article.variationIndex, article.variationCount]),
  [[4, 5]]
);
assert.equal(expandDraftVariations([{ title: "RSS", content: "Content" }], "rss_feed", 3).length, 1);
assert.equal(feedSourceItemCount(3), 3);
assert.equal(feedSourceItemCount(999), 20);
assert.equal(feedCandidateItemCount(3), 12);
assert.equal(feedCandidateItemCount(20), 50);
assert.match(buildSettingsInstructions({ articleLanguage: "US English" }), /Write in US English/);
assert.doesNotMatch(buildSettingsInstructions({ articleLanguage: "US English" }, "", { includeArticleLanguage: false }), /Write in US English/);
const personaWriterPrompt = buildWriterSystemPrompt("Türkçe ve doğal yaz.");
assert.match(personaWriterPrompt, /Türkçe ve doğal yaz/);
assert.match(personaWriterPrompt, /first non-empty line must be exactly one H1/i);

const odysseySource = `Odyssey’de Penelope’nin Yatak Testi: Zeytin Ağacı Neden Taşınamaz?

Kısa cevap: Penelope, karşısındaki kişinin gerçekten Odysseus olup olmadığını anlamak için yatağın taşınmasını ister.

Yatak neden taşınamaz?
Odysseus yatağı yaşayan bir zeytin ağacının çevresine yapmıştır.`;
const grokWithoutMarkdownH1 = `Penelope’nin Yatak Testi: Zeytin Ağacı Neden Taşınamazdı?

Homeros’un destanında evlilik yatağı sıradan bir mobilya değildir. Bu giriş paragrafı model tarafından oluşturulmuştur.

## Yatak Neden Yerinden Oynatılamaz?

Yatağın direklerinden biri yaşayan zeytin ağacının gövdesidir.`;
const recoveredGrokDraft = enforceGeneratedArticleContracts(grokWithoutMarkdownH1, {
  sourceType: "raw_text",
  topic: odysseySource,
  settings: { articleLanguage: "Turkish" },
});
assert.match(recoveredGrokDraft, /^# Penelope’nin Yatak Testi: Zeytin Ağacı Neden Taşınamazdı\?$/m);
assert.doesNotMatch(recoveredGrokDraft, /# Odyssey’de.*Kısa cevap:/);
assert.equal(generatedPostTitle(recoveredGrokDraft, odysseySource), "Penelope’nin Yatak Testi: Zeytin Ağacı Neden Taşınamazdı?");
const missingH1WithH2Body = enforceGeneratedArticleContracts("## İlk Bölüm\n\nGövde metni burada başlar.", {
  sourceType: "raw_text",
  topic: odysseySource,
  settings: { articleLanguage: "Turkish" },
});
assert.match(missingH1WithH2Body, /^# Odyssey’de Penelope’nin Yatak Testi: Zeytin Ağacı Neden Taşınamaz\?\n\n## İlk Bölüm/m);

const malformedSourceH1 = `# ${odysseySource.replace(/\s+/g, " ")}\n\nGerçek gövde metni.`;
const repairedSourceH1 = enforceGeneratedArticleContracts(malformedSourceH1, {
  sourceType: "raw_text",
  topic: odysseySource,
  settings: { articleLanguage: "Turkish" },
});
assert.match(repairedSourceH1, /^# Odyssey’de Penelope’nin Yatak Testi: Zeytin Ağacı Neden Taşınamaz\?$/m);
assert.equal(generatedPostTitle(malformedSourceH1, odysseySource), "Odyssey’de Penelope’nin Yatak Testi: Zeytin Ağacı Neden Taşınamaz?");

const wordContract = resolveGenerationContract({ articleWordCount: 1500 });
assert.equal(wordContract.targetWords, 1500);
assert.equal(wordContract.minWords, 1200);
assert.equal(wordContract.maxWords, 1800);
assert.deepEqual(resolveGenerationContract(applyGenerationOverrides({
  enableInternalLinks: true,
  internalLinkDensity: "balanced",
}, { internalLinkDensity: "minimal" })).internalLinkTarget, [1, 2]);
const shortContract = buildGenerationContractMetadata(
  Array.from({ length: 800 }, (_, index) => `word${index}`).join(" "),
  { articleWordCount: 1500 }
);
assert.equal(shortContract.actualWords! < shortContract.minWords!, true);

const urlWithoutFaq = enforceGeneratedArticleContracts(`# Source Rewrite

This article explains the source in practical terms.
`, {
  sourceType: "url",
  topic: "Source Rewrite",
  settings: { articleLanguage: "US English" },
});
assert.equal(buildGenerationContractMetadata(urlWithoutFaq).faqCount, 0);
assert.doesNotMatch(urlWithoutFaq, /## FAQs/);
assert.doesNotMatch(urlWithoutFaq, /### Why does Source Rewrite matter\?/);

const structuredUrlDraft = enforceGeneratedArticleContracts(`# Mythos Preview

Claude Mythos Preview, önceki modellerin ulaştığı noktanın ötesine geçerek açıkları sadece tespit etmekle kalmıyor; bu açıkları gerçekçi saldırı zincirlerine dönüştürebiliyor. Bu yeteneği ölçmek için kullanılan yeni nesil benchmarklar, konuyu daha somut sayılara ve aşamalara indiriyor.

ExploitBench, özellikle V8 motorundaki farklı güvenlik açıklarını temel alan bir ölçüm ortamı sunuyor. V8, Chrome, Edge, Node.js ve Electron tabanlı uygulamaların temelini oluşturduğu için bulguların pratik etkisi yüksek. Benchmark, istismar sürecini beş ana kademeye ayırıyor.

ExploitGym, benzer bir değerlendirmeyi daha geniş bir hedef kümesine yayarak gerçekleştiriyor. Farklı yazılım ortamlarındaki istismar yeteneğini ölçmeyi amaçlıyor ve modelin zincir kurma becerisini daha görünür hale getiriyor.

SCONE-bench ise akıllı sözleşme odaklı bir değerlendirme aracı olarak öne çıkıyor. Web3 ekipleri için model tabanlı testlerin ne kadar hızlı geliştiğini gösteriyor ve savunma otomasyonunun önemini artırıyor.
`, {
  sourceType: "url",
  topic: "Mythos Preview’un İstismar Geliştirme Yeteneği",
  settings: { articleLanguage: "Turkish" },
});
assert.equal((structuredUrlDraft.match(/^##\s+/gm) || []).length >= 2, true);

const balancedLinkSettings = {
  enableInternalLinks: true,
  internalLinkDensity: "balanced",
  internalLinkIndex: {
    siteHost: "example.com",
    pages: Array.from({ length: 6 }, (_, index) => ({
      title: `Related Guide ${index + 1}`,
      path: `/guide-${index + 1}`,
      url: `https://example.com/guide-${index + 1}`,
    })),
  },
};
const balancedLinks = enforceGeneratedArticleContracts(`# Link Guide

This draft has useful body copy but no natural anchors.
`, {
  sourceType: "raw_text",
  topic: "Link Guide",
  settings: balancedLinkSettings,
});
const balancedContract = buildGenerationContractMetadata(balancedLinks, balancedLinkSettings);
assert.equal(balancedContract.internalLinkCount, 0);
assert.doesNotMatch(balancedLinks, /Related Reading|İlgili Okumalar/);
assert.doesNotMatch(urlWithoutFaq, /Source Rewrite neden önemli/);

const ruleLinked = enforceGeneratedArticleContracts(`# Demo Guide

Teams can book a demo when they are ready.
`, {
  sourceType: "article_title",
  topic: "Demo Guide",
  settings: {
    enableInternalLinks: true,
    internalLinkDensity: "minimal",
    internalLinkRules: [{ id: "demo", triggers: "book a demo", url: "https://example.com/demo" }],
    internalLinkIndex: { siteHost: "example.com", pages: [] },
  },
});
assert.match(ruleLinked, /\[book a demo]\(https:\/\/example\.com\/demo\)/i);
assert.equal(buildGenerationContractMetadata(ruleLinked, { internalLinkIndex: { siteHost: "example.com" } }).internalLinkCount, 1);

const qa = evaluateSeoQa(`## Template Used
How-to

## SEO Keywords
seo content, seo content strategy

## Slug
seo-content-guide

## Meta Title
SEO Content Guide

## Meta Description
Learn how to plan SEO content with keywords, structure, examples, internal links, and practical checks. Start building stronger search pages today.

## Key Points
- SEO content needs intent, structure, and useful proof.
- Each section should add something new.
- Internal links help readers move through the site.

# SEO Content Guide

SEO content starts with matching the topic to search intent. ${"Useful detail. ".repeat(1250)}

## FAQs
### What is SEO content?
SEO content is content built to answer search demand.
### How long should SEO content be?
It should be as long as needed to answer the query.
### How do internal links help SEO?
Internal links connect related pages.

## Call to Action
Get started with our SEO workflow.

## Image Suggestions
- seo-content-guide.png: SEO content workflow diagram.

## References
- Google Search Central
`, { keyword: "seo content", settings: { internalLinkIndex: { siteHost: "example.com" } }, articleType: "how_to" });

assert.equal(qa.checks.some((item) => item.label === "H1 included" && item.ok), true);
assert.equal(qa.articleType, "how_to");

const leanSettingsPrompt = buildSettingsInstructions({
  articleWordCount: 2400,
  includeTableOfContents: true,
  enableResearch: true,
  enableInternalLinks: true,
  internalLinkDensity: "rich",
  internalLinkIndex: {
    siteHost: "example.com",
    pages: [{ title: "Pricing", path: "/pricing", url: "https://example.com/pricing" }],
  },
  customArticleInstructions: "Write with short paragraphs.",
  brandCompanyName: "ExampleCo",
  brandDescription: "A useful product for content teams.",
}, "pricing guide");

assert.doesNotMatch(leanSettingsPrompt, /Internal link density|Pricing:|Table of contents|research/i);
assert.match(leanSettingsPrompt, /Write with short paragraphs/);
assert.match(leanSettingsPrompt, /ExampleCo/);

const snakeSettingsPrompt = buildSettingsInstructions({
  article_language: "Turkish",
  custom_article_instructions: "Use first-hand product language.",
  brand_company_name: "SnakeCo",
  brand_description: "A platform for saved API snapshots.",
  brand_target_audience: "technical founders",
  brand_mentions: "prominent",
  brand_value_props: ["Fast setup", "Clean drafts", "Editorial controls", "Live sources", "Low image cost"],
  knowledge_base_enabled: true,
  knowledge_documents: [{ title: "Fact", content: "SnakeCo supports URL, PDF, raw text, YouTube, RSS, and campaigns." }],
}, "campaigns");

assert.match(snakeSettingsPrompt, /Write in Turkish/);
assert.match(snakeSettingsPrompt, /SnakeCo/);
assert.match(snakeSettingsPrompt, /technical founders/);
assert.match(snakeSettingsPrompt, /recurring lens/);
assert.match(snakeSettingsPrompt, /Low image cost/);
assert.match(snakeSettingsPrompt, /URL, PDF, raw text, YouTube, RSS, and campaigns/);

const leanArticleExtras = buildArticleExtras({
  userId: "user",
  sourceType: "article_title",
  sourceValue: "Prompt Quality",
  articleType: "auto",
  customInstructions: "Use a direct, skeptical tone.",
  articleDirection: "Compare bloated prompts with short prompts.",
});

assert.doesNotMatch(leanArticleExtras, /Template Used|SEO Keywords|Meta Title|Image Suggestions|internal-link/i);
assert.match(leanArticleExtras, /Use a direct, skeptical tone/);

const repaired = enforceGeneratedArticleContracts(`# Agentik Kodlama

## Gelecek İçin İpuçları

Yapay Zeka ile Dijital Pazarlama Rehberi yazısında da benzer bir yaklaşım vardı.
`, {
  sourceType: "article_title",
  topic: "Agentik Kodlama",
  settings: {
    articleLanguage: "Turkish",
    enableInternalLinks: true,
    internalLinkIndex: {
      siteHost: "example.com",
      pages: [
        { title: "Yapay Zeka ile Dijital Pazarlama Rehberi", path: "/blog/yapay-zeka", url: "https://example.com/blog/yapay-zeka" },
      ],
    },
  },
});

assert.match(repaired, /\[Yapay Zeka ile Dijital Pazarlama Rehberi]\(https:\/\/example\.com\/blog\/yapay-zeka\)/);
assert.doesNotMatch(repaired, /## Sık Sorulan Sorular/);
assert.equal(evaluateSeoQa(repaired, {
  settings: { internalLinkIndex: { siteHost: "example.com" } },
  articleType: "how_to",
}).checks.find((item) => item.label === "Internal links included")?.ok, true);
assert.equal(evaluateSeoQa(repaired, { articleType: "how_to" }).checks.find((item) => item.label === "FAQs included")?.ok, false);

const localized = enforceGeneratedArticleContracts(`# Paving the way for agents in biology \\ Anthropic

Biyolojide yapay zeka ajanlarının karşılaştığı temel engellerden biri, insan kullanımına göre tasarlanmış veritabanlarının karmaşık yapısıdır. Virüs dizisi gibi verilere ulaşmak isteyen ajanlar zorlanıyor.
`, {
  sourceType: "url",
  topic: "Paving the way for agents in biology",
  settings: { articleLanguage: "Turkish" },
});

assert.match(localized, /^# Biyolojide yapay zeka ajanlarının önündeki temel/m);
assert.doesNotMatch(localized, /^# Paving the way/m);
const localizedModelSubtitle = enforceGeneratedArticleContracts(`# Meta Ordered by E.U. to Alter ‘Addictive Design’ of Instagram and Facebook

Meta, Instagram ve Facebook’un Bağımlılık Yaratan Tasarımlarını Değiştirmek Zorunda

Avrupa Birliği yetkilileri, Meta’nın sosyal medya platformlarındaki bağımlılık yaratan tasarım özelliklerini yasaya aykırı buldu.
`, {
  sourceType: "rss_feed",
  topic: "Meta Ordered by E.U. to Alter ‘Addictive Design’ of Instagram and Facebook",
  settings: { articleLanguage: "Turkish" },
});
assert.match(localizedModelSubtitle, /^# Meta, Instagram ve Facebook’un Bağımlılık Yaratan Tasarımlarını Değiştirmek Zorunda/m);
const structuredEmmy = enforceGeneratedArticleContracts(`# Emmys Snubs and Surprises 2026

2026 Emmy Ödülleri Sürprizleri

Giriş paragrafı Türkçe içerikle devam ediyor ve okuyucuya adaylıklar hakkında yeterli bağlam veriyor.

**Jon Hamm'in Dönüşü**

## Jon Hamm uzun yıllardır ekranlarda başarılı işler

Jon Hamm uzun yıllardır ekranlarda başarılı işler çıkardı ve bu yıl yeniden aday gösterildi.

**Sonuç**

Emmy adaylıkları bu yıl yine sürprizlerle doluydu.

Sıkça Sorulan Sorular

Emmy adaylıkları nasıl belirleniyor? Jüri üyeleri sezon boyunca yapımları izleyerek puan veriyor.
`, {
  sourceType: "rss_feed",
  topic: "Emmys Snubs and Surprises 2026",
  settings: { articleLanguage: "Turkish" },
});
assert.match(structuredEmmy, /^# 2026 Emmy Ödülleri Sürprizleri/m);
assert.doesNotMatch(structuredEmmy, /^2026 Emmy Ödülleri Sürprizleri$|^## Jon Hamm uzun yıllardır/m);
assert.match(structuredEmmy, /^## Jon Hamm'in Dönüşü$/m);
assert.match(structuredEmmy, /^## Sonuç$/m);
assert.match(structuredEmmy, /^## Sık Sorulan Sorular\n\n### Emmy adaylıkları nasıl belirleniyor\?\nJüri üyeleri/m);
assert.equal(
  slugify("Biyolojide yapay zeka ajanlarının önündeki temel engeller"),
  "biyolojide-yapay-zeka-ajanlarinin-onundeki"
);
assert.deepEqual(publishTags(), []);
assert.deepEqual(publishTags(["Biyolojide", "yapay", "zeka", "ajanlarının", "karşılaştığı", "fazla", "etiket", "son", "dokuzuncu"]), [
  "Biyolojide",
  "yapay",
  "zeka",
  "ajanlarının",
  "karşılaştığı",
  "fazla",
  "etiket",
  "son",
]);
assert.equal(
  publishTitle("Paving the way for agents in biology \\ Anthropic", localized),
  "Biyolojide yapay zeka ajanlarının önündeki temel engeller"
);
assert.equal(truncateAtWord("Biyolojide yapay zeka ajanları veri tabanı engellerini aşmaya çalışıyor.", 42), "Biyolojide yapay zeka ajanları veri tabanı");
assert.equal(
  openRouterErrorMessage(JSON.stringify({
    error: {
      message: "Provider returned error",
      metadata: { provider_name: "xAI", raw: JSON.stringify({ error: { message: "upstream overloaded" } }) },
    },
  }), 502, "x-ai/grok-4.3"),
  "x-ai/grok-4.3: xAI HTTP 502 — upstream overloaded"
);

console.log("seo-topic-duplicate self-check passed");
