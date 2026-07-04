import assert from "node:assert/strict";
import { anchorGeneratedTitleToSource, applyGenerationOverrides, applySeoPackage, articleTemplateInstructions, buildArticleExtras, buildGenerationContractMetadata, buildSettingsInstructions, enforceGeneratedArticleContracts, evaluateSeoQa, expandDraftVariations, feedCandidateItemCount, feedSourceItemCount, findIndexedTopicDuplicate, openRouterErrorMessage, resolveGenerationContract } from "./generate-content.js";
import { cleanPostTitle } from "./post-cleanup.js";
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
assert.equal(cleanPostTitle("Apple, MacBook ve iPad fiyatlarına zam yaptı - Webrazzi"), "Apple, MacBook ve iPad fiyatlarına zam yaptı");
assert.equal(cleanPostTitle("Apple, MacBook ve iPad fiyatlarına zam yaptı - Webrazzi:"), "Apple, MacBook ve iPad fiyatlarına zam yaptı");
assert.equal(cleanPostTitle("Meta, yeni yapay zeka destekli akıllı gözlük serisini tanıttı - Swipeline"), "Meta, yeni yapay zeka destekli akıllı gözlük serisini tanıttı");
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

assert.equal(qa.checks.some((item) => item.label === "Meta title available" && item.ok), true);
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

const seoPackaged = applySeoPackage(`## Meta Title
Old title

# SEO Content Guide

Intro paragraph.

## Key Points
- Old point.

## FAQs
### Old question?
Old answer.
`, {
  slug: "ultimate seo content strategy guide for teams",
  metaTitle: "SEO Content Strategy Guide for Teams",
  metaDescription: "Plan SEO content strategy for SaaS teams with long-tail keyword research and search intent mapping. Start improving briefs today.",
  keyPoints: [
    "SEO content strategy starts with search intent and a clear primary keyword.",
    "Strong briefs map long-tail keywords to useful sections before drafting.",
    "FAQ ideas should come from real user queries instead of generic filler.",
  ],
  faqs: [
    { question: "How do SaaS teams plan SEO content strategy?", answer: "They map search intent, product proof, and long-tail keywords before drafting.", sourceQuery: "how to plan seo content strategy" },
    { question: "What should an SEO content brief include?", answer: "It should include the primary keyword, target audience, headings, proof points, and FAQs.", sourceQuery: "seo content brief checklist" },
    { question: "How are People Also Ask questions used in SEO articles?", answer: "They reveal real user questions that can become concise FAQ entries.", sourceQuery: "people also ask seo faq" },
  ],
}, { topic: "SEO content strategy", settings: { articleLanguage: "US English" } });

assert.match(seoPackaged, /^## Slug\nultimate-seo-content-strategy-guide/m);
assert.match(seoPackaged, /^## Meta Title\nSEO Content Strategy Guide for Teams/m);
assert.match(seoPackaged, /^# SEO Content Guide\n\nIntro paragraph\./m);
assert.match(seoPackaged, /## FAQs\n\n### How do SaaS teams plan SEO content strategy\?/);
assert.doesNotMatch(seoPackaged, /## Key Points|Old question|Old point|Old title/);

const turkishSeoPackaged = applySeoPackage(`# Claude Mythos Preview

Kisa giris.

## Sıkça Sorulan Sorular
### Eski soru?
Eski cevap.
`, {
  slug: "claude mythos preview",
  metaTitle: "Claude Mythos Preview Rehberi",
  metaDescription: "Claude Mythos Preview sonuçlarını, benchmark farklarını ve güvenlik etkilerini öğrenin. Yeni modeli daha bilinçli değerlendirin.",
  faqs: [
    { question: "Claude Mythos Preview hangi benchmarklarda öne çıktı?", answer: "ExploitBench, ExploitGym ve SCONE-bench sonuçlarında diğer modellere göre daha güçlü performans gösterdi.", sourceQuery: "Claude Mythos Preview benchmark" },
    { question: "ExploitBench T seviyeleri ne anlama gelir?", answer: "T seviyeleri modelin istismar zincirlerini ne kadar ileri taşıyabildiğini gösteren performans basamaklarıdır.", sourceQuery: "ExploitBench T levels" },
    { question: "Web3 ekipleri bu sonuçlardan nasıl etkilenir?", answer: "Akıllı sözleşme güvenliği, model tabanlı test ve savunma otomasyonu daha önemli hale gelir.", sourceQuery: "AI exploit benchmark Web3 security" },
  ],
}, { topic: "Claude Mythos Preview", settings: { articleLanguage: "Turkish" } });

assert.equal((turkishSeoPackaged.match(/## Sık Sorulan Sorular/g) || []).length, 1);
assert.doesNotMatch(turkishSeoPackaged, /Sıkça Sorulan Sorular|Eski soru|Eski cevap|## Key Points/);

const plainFaqPackaged = applySeoPackage(`# Apple zamları

Kısa giriş.

Sıkça Sorulan Sorular

Apple ürünleri neden zamlandı? Eski cevap.

İkinci el MacBook almak güvenli mi? Eski cevap.
`, {
  slug: "apple zam",
  metaTitle: "Apple MacBook ve iPad Zamları",
  metaDescription: "Apple MacBook ve iPad zamlarını, fiyat etkilerini ve alternatif cihaz seçeneklerini öğrenin. Güncel önerileri inceleyin.",
  faqs: [
    { question: "Apple MacBook ve iPad fiyatlarında ne kadar artış oldu?", answer: "Artış oranı modele göre değişir; en güncel fiyatlar Apple Türkiye ve yetkili satıcılardan kontrol edilmelidir." },
    { question: "Apple ürünlerinde zam neden Mac ve iPad odaklı oldu?", answer: "Tedarik ve maliyet baskısı özellikle bu ürün gruplarında daha görünür hale geldi." },
    { question: "Alternatif olarak hangi cihazlar değerlendirilebilir?", answer: "Windows tabanlı ultrabook modelleri ve Linux uyumlu dizüstüler maliyet açısından seçenek olabilir." },
  ],
}, { topic: "Apple MacBook ve iPad zamları", settings: { articleLanguage: "Turkish" } });

assert.equal((plainFaqPackaged.match(/Sık(?:ça)? Sorulan Sorular/g) || []).length, 1);
assert.doesNotMatch(plainFaqPackaged, /Apple ürünleri neden zamlandı\? Eski cevap|İkinci el MacBook almak güvenli mi\? Eski cevap/);

const cleanedMetaPackage = applySeoPackage(`# Mythos Preview’un İstismar Geliştirme Yeteneği: Yeni Benchmarklarla Ortaya Çıkan Gerçekler

Mythos Preview güvenlik benchmarklarında yeni sonuçlar üretiyor. ExploitBench ve ExploitGym gibi ölçümler modelin istismar zincirlerini nasıl kurduğunu gösteriyor.
`, {
  slug: "mythos preview benchmark",
  metaTitle: "Mythos Preview’nin İstismar Geliştirme Yeteneği: Yeni",
  metaDescription: "Mythos Preview’nin istismar geliştirme yeteneği ve yeni benchmark’lar. ExploitBench ve ExploitGym ile güvenlik açıkları tespit edin. Detaylı analiz için",
  faqs: [
    { question: "Mythos Preview hangi benchmarklarda öne çıkıyor?", answer: "ExploitBench ve ExploitGym gibi benchmarklarda zincir kurma performansıyla öne çıkıyor." },
    { question: "ExploitBench neyi ölçer?", answer: "Modelin güvenlik açıklarını istismar zincirlerine dönüştürme becerisini ölçer." },
    { question: "Bu sonuçlar ekipler için neden önemli?", answer: "Güvenlik ekiplerinin model tabanlı testleri daha dikkatli değerlendirmesini sağlar." },
  ],
}, { topic: "Mythos Preview’un İstismar Geliştirme Yeteneği", settings: { articleLanguage: "Turkish" } });
const cleanedMetaTitle = cleanedMetaPackage.match(/^## Meta Title\n(.+)$/m)?.[1] || "";
const cleanedMetaDescription = cleanedMetaPackage.match(/^## Meta Description\n(.+)$/m)?.[1] || "";
assert.equal(cleanedMetaTitle.length <= 60, true);
assert.doesNotMatch(cleanedMetaTitle, /(?:[:–—-]\s*)?Yeni$/i);
assert.equal(cleanedMetaDescription.length <= 145, true);
assert.doesNotMatch(cleanedMetaDescription, /\biçin$/i);

const localized = enforceGeneratedArticleContracts(`# Paving the way for agents in biology \\ Anthropic

Biyolojide yapay zeka ajanlarının karşılaştığı temel engellerden biri, insan kullanımına göre tasarlanmış veritabanlarının karmaşık yapısıdır. Virüs dizisi gibi verilere ulaşmak isteyen ajanlar zorlanıyor.
`, {
  sourceType: "url",
  topic: "Paving the way for agents in biology",
  settings: { articleLanguage: "Turkish" },
});

assert.match(localized, /^# Biyolojide yapay zeka ajanlarının önündeki temel/m);
assert.doesNotMatch(localized, /^# Paving the way/m);
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
