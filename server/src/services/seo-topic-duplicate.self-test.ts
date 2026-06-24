import assert from "node:assert/strict";
import { articleTemplateInstructions, buildArticleExtras, buildGenerationContractMetadata, buildSettingsInstructions, enforceGeneratedArticleContracts, evaluateSeoQa, expandDraftVariations, findIndexedTopicDuplicate, openRouterErrorMessage, resolveGenerationContract } from "./generate-content.js";
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
assert.equal(expandDraftVariations([{ title: "RSS", content: "Content" }], "rss_feed", 3).length, 1);

const wordContract = resolveGenerationContract({ articleWordCount: 1500 });
assert.equal(wordContract.targetWords, 1500);
assert.equal(wordContract.minWords, 1200);
assert.equal(wordContract.maxWords, 1800);
const shortContract = buildGenerationContractMetadata(
  Array.from({ length: 800 }, (_, index) => `word${index}`).join(" "),
  { articleWordCount: 1500 }
);
assert.equal(shortContract.actualWords! < shortContract.minWords!, true);

const urlFaqRepair = enforceGeneratedArticleContracts(`# Source Rewrite

This article explains the source in practical terms.
`, {
  sourceType: "url",
  topic: "Source Rewrite",
  settings: { articleLanguage: "US English" },
});
assert.equal(buildGenerationContractMetadata(urlFaqRepair).faqCount, 3);

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
assert.doesNotMatch(urlFaqRepair, /Source Rewrite neden önemli/);
assert.match(urlFaqRepair, /### Why does this topic matter\?/);

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
  knowledge_base_enabled: true,
  knowledge_documents: [{ title: "Fact", content: "SnakeCo supports URL, PDF, raw text, YouTube, RSS, and campaigns." }],
}, "campaigns");

assert.match(snakeSettingsPrompt, /Write in Turkish/);
assert.match(snakeSettingsPrompt, /SnakeCo/);
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
assert.match(repaired, /## Sık Sorulan Sorular/);
assert.equal(evaluateSeoQa(repaired, {
  settings: { internalLinkIndex: { siteHost: "example.com" } },
  articleType: "how_to",
}).checks.find((item) => item.label === "Internal links included")?.ok, true);
assert.equal(evaluateSeoQa(repaired, { articleType: "how_to" }).checks.find((item) => item.label === "FAQs included")?.ok, true);

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
  "biyolojide-yapay-zeka-ajanlarinin-onundeki-temel-engeller"
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
