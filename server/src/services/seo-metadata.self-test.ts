import assert from "node:assert/strict";
import { duplicateSeoSlugs, generateValidatedCandidate, mergeManualSeoMetadata, normalizeSeoSlug, parseSeoCandidate, readySeoMetadataForArticle, SEO_LIMITS, SEO_RESPONSE_FORMAT, SeoGenerationAttemptError, seoSourceHash, seoStatusForArticle, validateSeoForArticle, validateSeoMetadata } from "./seo-metadata.js";

assert.deepEqual(SEO_RESPONSE_FORMAT.json_schema.schema.properties.metaTitle, { type: "string", minLength: 45, maxLength: 60 });
assert.deepEqual(SEO_RESPONSE_FORMAT.json_schema.schema.properties.metaDescription, { type: "string", minLength: 120, maxLength: 145 });

const valid = parseSeoCandidate({
  slug: "twitter-yirmi-yil-memler-toplumsal-hareketler",
  metaTitle: "Twitter’ın 20 Yılı: Memlerden Toplumsal Harekete",
  metaDescription: "Twitter’ın yirmi yıllık dönüşümünü, mem kültüründen toplumsal hareketlere uzanan etkisi ve değişen kullanıcı alışkanlıklarıyla inceleyin.",
  primaryQuery: "Twitter'ın 20 yılı",
  searchIntent: "informational",
  language: "tr",
});
assert.equal(validateSeoMetadata(valid).length, 0);
assert.equal(valid.metaDescription.length <= SEO_LIMITS.descriptionMax, true);
assert.equal(normalizeSeoSlug("Twitter’ın 20. Yılı: Memler ve Öfke"), "twitter-in-20-yili-memler-ve-ofke");
assert.equal(seoSourceHash("Title", "Body  copy"), seoSourceHash("Title", "Body copy"));

const repeated = { ...valid, metaDescription: "Twitter toplumsal hareket etkisi Twitter toplumsal hareket etkisi Twitter toplumsal hareket etkisi gündemi ve kullanıcıları dönüştürmeye devam ediyor." };
assert.match(validateSeoMetadata(repeated).join(" "), /repeats/i);
assert.match(validateSeoMetadata({ ...valid, metaDescription: valid.metaDescription.slice(0, 119) }).join(" "), /120-145/);
assert.match(validateSeoMetadata({ ...valid, metaDescription: "Bu açıklama yeterince uzun görünse bile tamamlanmış bir cümle değildir ve yayın sistemine gönderilmemelidir çünkü sınırda yarım kalır" }).join(" "), /complete sentence/i);
assert.match(validateSeoForArticle({ ...valid, language: "en", metaTitle: "A Complete English Metadata Title for This Article", metaDescription: "This complete English description explains the article clearly, but it must fail because the source article itself is written entirely in Turkish." }, "Bu yazı bir konunun neden önemli olduğunu ve insanlar için nasıl yeni bir etki oluşturduğunu Türkçe olarak anlatıyor.").join(" "), /article language/i);
assert.match(validateSeoForArticle({ ...valid, language: "en", metaTitle: "A Complete English Metadata Title for This Article", metaDescription: "This complete English description explains the article clearly, but it must fail because the requested article metadata should be German." }, "Der Artikel erklärt, warum die neue Technik für die Menschen wichtig ist und wie sie mit einer klaren Strategie eingesetzt wird.", "German").join(" "), /requested.*language/i);
assert.match(validateSeoMetadata({ ...valid, slug: "two-words" }).join(" "), /three meaningful words/i);
assert.match(validateSeoMetadata({ ...valid, searchIntent: "browse" }).join(" "), /supported vocabulary/i);
assert.match(validateSeoForArticle(valid, "Yazı içeriği", "tr", valid.metaTitle).join(" "), /must not copy the article title/i);
assert.match(validateSeoForArticle({ ...valid, metaDescription: `${valid.metaTitle}, sosyal hareketler ve değişen kullanıcı alışkanlıkları üzerinden platformun dönüşümünü ayrıntılı biçimde açıklıyor.` }, "Yazı içeriği", "tr", valid.metaTitle).join(" "), /must not begin by copying/i);

const hash = seoSourceHash("Başlık", "İçerik");
const ready = {
  version: 1 as const,
  status: "ready" as const,
  sourceHash: hash,
  ...valid,
  provenance: { slug: "ai" as const, metaTitle: "ai" as const, metaDescription: "ai" as const, primaryQuery: "ai" as const, searchIntent: "ai" as const, language: "ai" as const },
  manualReviewRequired: false,
  modelId: "test/model",
  generatedAt: "2026-07-16T00:00:00.000Z",
  validationErrors: [],
  error: null,
};
assert.ok(readySeoMetadataForArticle(ready, "Başlık", "İçerik"));
assert.equal(readySeoMetadataForArticle({ ...ready, status: "pending" }, "Başlık", "İçerik"), null);
assert.equal(readySeoMetadataForArticle({ ...ready, status: "failed" }, "Başlık", "İçerik"), null);
assert.equal(readySeoMetadataForArticle(ready, "Başlık", "Değişmiş içerik"), null);
assert.equal(seoStatusForArticle(ready, "Başlık", "Değişmiş içerik"), "needs_review");
assert.equal(seoStatusForArticle(null, "Başlık", "İçerik"), "missing");
assert.deepEqual(duplicateSeoSlugs([{ id: "a", slug: "same-slug" }, { id: "b", slug: "same-slug" }, { id: "c", slug: "unique-slug" }]), ["a", "b"]);

const manuallyEdited = mergeManualSeoMetadata(ready, { ...valid, slug: "twitter-memler-toplumsal-hareketler-yirmi-yil" }, hash, "2026-07-16T01:00:00.000Z");
assert.deepEqual(manuallyEdited.provenance, { slug: "manual", metaTitle: "ai", metaDescription: "ai", primaryQuery: "ai", searchIntent: "ai", language: "ai" });

const response = (candidate: typeof valid) => ({ candidate, usage: {}, cost: 0, responseData: {}, latencyMs: 1 });
const generationInput = {
  apiKey: "test",
  modelId: "test/model",
  title: "Twitter’ın 20 Yılı",
  content: "Bu yazı Twitter'ın dönüşümünü ve toplumsal etkisini ayrıntılı biçimde anlatıyor.",
  sourceRef: "https://example.com/source",
  keywords: [],
  siteName: "Test",
  siteContext: "Teknoloji haberleri",
  requestedLanguage: "Turkish",
};
let repairCalls = 0;
const repaired = await generateValidatedCandidate(generationInput, async () => response(++repairCalls === 1 ? { ...valid, metaDescription: "Geçersiz." } : valid));
assert.equal(repaired.attempts, 2);
assert.equal(repairCalls, 2);
let contextualPrompt = "";
let contextualCalls = 0;
const contextualResult = await generateValidatedCandidate({
  ...generationInput,
  keywords: ["yerel tesisatçı"],
  requestedIntent: "transactional",
}, async (_apiKey, _modelId, prompt) => {
  contextualCalls += 1;
  contextualPrompt = prompt;
  return response(contextualCalls === 1 ? valid : { ...valid, primaryQuery: "yerel tesisatçı", searchIntent: "transactional" });
});
assert.match(contextualPrompt, /Provided keywords: yerel tesisatçı/);
assert.match(contextualPrompt, /Provided search intent: transactional/);
assert.equal(contextualResult.attempts, 2);
let parseRepairCalls = 0;
const parseRepaired = await generateValidatedCandidate(generationInput, async () => {
  parseRepairCalls += 1;
  if (parseRepairCalls === 1) throw new SeoGenerationAttemptError("AI did not return a JSON object", { total_tokens: 10 }, 0.01, 5, {}, "not-json");
  return response(valid);
});
assert.equal(parseRepaired.attempts, 2);
assert.equal(parseRepaired.usage.total_tokens, 10);
assert.equal(parseRepairCalls, 2);
let failedCalls = 0;
await assert.rejects(
  generateValidatedCandidate(generationInput, async () => {
    failedCalls += 1;
    return response({ ...valid, metaDescription: "Geçersiz." });
  }),
  /remained invalid after repair/i,
);
assert.equal(failedCalls, 2);

const screenshotRegressions = [
  {
    slug: "trump-fosil-yakit-politikasi-beyaz-saray-toplantisi",
    metaTitle: "Trump’ın Fosil Yakıt Bağlılığı Beyaz Saray’da",
    metaDescription: "Trump’ın enerji politikaları, Beyaz Saray toplantısının fosil yakıt lobisi, iklim hedefleri ve yatırımlar üzerindeki etkisini gösteriyor.",
    primaryQuery: "Trump fosil yakıt politikası",
    searchIntent: "informational",
    language: "tr",
  },
  {
    slug: "the-potluck-greensboro-katliami-tiyatro-oyunu",
    metaTitle: "The Potluck Oyunu: Greensboro Katliamı ve Zor Miras",
    metaDescription: "César Alvarez’in The Potluck oyunu, Greensboro Katliamı’nın hafızasını tiyatro, göç ve toplumsal yüzleşme üzerinden sahneye taşıyor.",
    primaryQuery: "The Potluck oyunu",
    searchIntent: "informational",
    language: "tr",
  },
  {
    slug: "venezuela-deprem-siyaset-halk-ofkesi",
    metaTitle: "Venezuela Depremi Sonrası Siyaset ve Halkın Öfkesi",
    metaDescription: "Venezuela’daki deprem sonrası halk öfkesi, siyasi baskının sokak protestolarına ve dijital dayanışmaya dönüşümünü gözler önüne seriyor.",
    primaryQuery: "Venezuela deprem sonrası siyaset",
    searchIntent: "informational",
    language: "tr",
  },
];
for (const fixture of screenshotRegressions) {
  assert.deepEqual(validateSeoMetadata(fixture), []);
  assert.ok(fixture.metaDescription.length <= SEO_LIMITS.descriptionMax);
}
