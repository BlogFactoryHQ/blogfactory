import assert from "node:assert/strict";
process.env.CREDENTIALS_ENCRYPTION_KEY ||= "0".repeat(64);
import { faqJsonLdHead } from "./structured-data.js";
import { BUILT_IN_PROGRAMMATIC_TEMPLATES, materializeProgrammaticItems, normalizeTemplate, scoreProgrammaticTemplate, templateVariables } from "./programmatic.js";
import { buildProfileDatasets } from "./profile-datasets.js";
import { normalizeCta, normalizeProfile, type TopicCandidate } from "./product-seo.js";
import { buildTopicSuggestions } from "./topic-refresh.js";
import { applyEmbeddingOverlap } from "./topic-embeddings.js";
import { missingQuestions, questionRefreshSuggestions } from "./refresh-questions.js";
import { readCronDrainConfig } from "../routes/cron.js";

// win 8: FAQ JSON-LD for Ghost
const withFaq = "# T\n\n## FAQ\n\n### Is it free?\n\nYes, the basic plan is free and includes weekly progress photos for everyone.\n\n### Does it work offline?\n\nIt works offline and syncs when you reconnect, so nothing is lost.\n";
const head = faqJsonLdHead(withFaq);
assert.ok(head?.startsWith('<script type="application/ld+json">'));
assert.ok(head?.endsWith("</script>"));
assert.equal(head?.includes("FAQPage"), true);
assert.equal(faqJsonLdHead("# T\n\n## FAQ\n\n### Only one?\n\nA single answer is not enough for markup because pages need two.\n"), null, "needs two Q&As");
assert.equal(faqJsonLdHead("no faq here"), null);
assert.equal(faqJsonLdHead(undefined), null);
const hostile = faqJsonLdHead("## FAQ\n\n### Q one?\n\nAnswer </script><script>alert(1)</script> text that is long enough.\n\n### Q two?\n\nSecond answer that is also long enough to count.\n");
assert.equal((hostile?.match(/<\/script>/g) || []).length, 1, "answer text cannot close the script tag");

// win 6: templates and datasets
const ids = BUILT_IN_PROGRAMMATIC_TEMPLATES.map((template) => template.id);
for (const id of ["builtin-alternatives", "builtin-use-case", "builtin-integration"]) assert.ok(ids.includes(id), id);
assert.equal(new Set(ids).size, ids.length, "template ids are unique");
for (const template of BUILT_IN_PROGRAMMATIC_TEMPLATES) {
  const normalized = normalizeTemplate(template);
  assert.deepEqual([...normalized.requiredVariables].sort(), [...templateVariables(template)].sort(), `${template.id} declares the variables it uses`);
  if (["builtin-alternatives", "builtin-use-case", "builtin-integration"].includes(template.id)) assert.ok(scoreProgrammaticTemplate(template).score >= 70, `${template.id} scores ${scoreProgrammaticTemplate(template).score}`);
}
const profile = { competitors: ["Hairmetric", "hairmetric", "Trackr"], problems: ["slow progress is hard to see"], audience: ["people with hair loss", "Slow progress is hard to see"] };
const datasets = buildProfileDatasets(profile, "Kellik", 2026);
assert.deepEqual(datasets.map((dataset) => dataset.templateId), ["builtin-alternatives", "builtin-product-comparison", "builtin-use-case"]);
assert.deepEqual(datasets[0].rows[0], { competitor: "Hairmetric", product: "Kellik", year: "2026" });
assert.deepEqual(datasets[1].columns, ["product_a", "product_b", "year"]);
assert.equal(datasets[2].rows.length, 2, "duplicate use cases collapse");
assert.equal(buildProfileDatasets({ competitors: [], problems: [], audience: [] }, "Kellik").length, 0);
for (const dataset of datasets) {
  const template = BUILT_IN_PROGRAMMATIC_TEMPLATES.find((item) => item.id === dataset.templateId)!;
  const { items } = materializeProgrammaticItems({ template, dataMode: "match_rows", rows: dataset.rows });
  assert.equal(items.length, dataset.rows.length, `${dataset.templateId} rows materialize`);
}

// win 3: CTA
assert.deepEqual(normalizeCta({ label: " Try Kellik ", description: "Track your hair growth in minutes." }), { label: "Try Kellik", description: "Track your hair growth in minutes." });
assert.equal(normalizeCta({ label: "x" }), null);
assert.equal(normalizeCta("text"), null);
assert.equal(normalizeProfile({ summary: "s", seedTopics: ["a b"], cta: { label: "Go", description: "Start now." } }, [], "ai").cta?.label, "Go");
assert.equal(normalizeProfile({ summary: "s" }, [], "ai").cta, null);

// win 9: weekly suggestions
const topic = (keyword: string, score: number, overlap = false): TopicCandidate => ({
  keyword, cluster: keyword, score, intent: "informational", fit: 0.5, sources: 1, question: false, template: false,
  overlap: overlap ? { title: "x", similarity: 0.9 } : null,
});
const first = buildTopicSuggestions([topic("a b", 50), topic("c d", 70), topic("e f", 90, true)], null, new Date("2026-11-04T00:00:00Z"));
assert.deepEqual(first.topics.map((item) => item.keyword), ["c d", "a b"], "covered topics are excluded");
assert.equal(first.newCount, 2, "first run counts everything as new");
const second = buildTopicSuggestions([topic("a b", 50), topic("g h", 60)], first, new Date("2026-11-11T00:00:00Z"));
assert.equal(second.newCount, 1, "only unseen topics are new");
assert.equal(second.checkedAt, "2026-11-11T00:00:00.000Z");
assert.equal(readCronDrainConfig(() => undefined, {}).topics.limit, 2);
assert.equal(readCronDrainConfig((name) => ({ topicsLimit: "99" }[name]), {}).topics.limit, 5, "topic refresh is capped");

// win 11: embedding overlap
const unit = (x: number, y: number) => { const n = Math.hypot(x, y); return [x / n, y / n]; };
const pool = [topic("hair growth tracker", 80), topic("pizza dough", 70), topic("already flagged", 60, true)];
const pages = [{ title: "Hair tracker guide", embedding: unit(1, 0.1) }, { title: "No vector page" }];
const adjusted = applyEmbeddingOverlap(pool, [unit(1, 0), unit(0, 1), unit(1, 0)], pages, 0.6);
const hair = adjusted.find((item) => item.keyword === "hair growth tracker")!;
assert.equal(hair.overlap?.method, "embedding");
assert.equal(hair.overlap?.title, "Hair tracker guide");
assert.equal(hair.score, 40, "overlap costs 40 points");
assert.equal(adjusted.find((item) => item.keyword === "pizza dough")?.overlap, null, "unrelated topics keep their score");
assert.equal(adjusted.find((item) => item.keyword === "already flagged")?.score, 60, "title overlap is not penalized twice");
assert.equal(adjusted[0].keyword, "pizza dough", "list is re-sorted after penalties");
assert.equal(applyEmbeddingOverlap(pool, [], [{ title: "x" }]).length, 3, "no page vectors means no change");

// win 10: refresh questions
const pageText = "Hair growth tracking works by taking weekly photos. Minoxidil results take months to appear on most people.";
const missing = missingQuestions(pageText, ["How hair growth tracking works"], [
  "how does hair growth tracking work",
  "how long does minoxidil take to show results",
  "can you track hair growth with an app",
  "is it free",
], 5);
assert.deepEqual(missing, ["how long does minoxidil take to show results", "can you track hair growth with an app"], "answered and heading-matched questions are skipped, thin ones ignored");
assert.equal(questionRefreshSuggestions([]).length, 0);
const suggestion = questionRefreshSuggestions(["q one here", "q two here"])[0];
assert.equal(suggestion.impact, "medium");
assert.ok(suggestion.title.includes("2 questions"));

console.log("product-wins self-test passed");
