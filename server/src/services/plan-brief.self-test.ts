import assert from "node:assert/strict";
import { outlineToText, sanitizePlanBrief, toPlanBrief } from "./plan-brief.js";
import { buildProductKnowledgeDoc, mergeProductKnowledge, pickPlanTopics, PRODUCT_KNOWLEDGE_SOURCE, type ProductProfile, type TopicCandidate } from "./product-seo.js";
import { retrieveKnowledgeChunks } from "./knowledge.js";

// win 1: brief
const withSerp = toPlanBrief({
  keyword: "hair growth tracker",
  questions: [{ question: "how to track hair growth" }, { question: "can you track hair growth with an app" }],
  serp: { brief: { targetWords: 2200, sharedHeadings: [{ heading: "what is a hair tracker" }, { heading: "Best hair trackers" }] } },
});
assert.equal(withSerp.source, "serp");
assert.equal(withSerp.targetWords, 2200);
assert.deepEqual(withSerp.outline.map((item) => `${item.level}:${item.text}`), [
  "2:What is a hair tracker", "2:Best hair trackers", "2:FAQ", "3:How to track hair growth?", "3:Can you track hair growth with an app?",
]);
assert.equal(outlineToText(withSerp.outline).split("\n")[0], "H2: What is a hair tracker");

const noSerp = toPlanBrief({ keyword: "x y z", questions: [], serp: null });
assert.equal(noSerp.source, "questions");
assert.equal(noSerp.targetWords, null);
assert.deepEqual(noSerp.outline, [], "no FAQ heading without questions");

// untrusted input
assert.equal(sanitizePlanBrief(null), null);
assert.equal(sanitizePlanBrief({ keyword: "" }), null);
const dirty = sanitizePlanBrief({
  keyword: "  k  ", targetWords: 999999, source: "weird",
  outline: [{ level: 9, text: "  A  " }, { level: 3, text: "B" }, { text: "" }, "junk", null],
  questions: ["q1", 5, "", "x".repeat(500)],
  extra: "<script>",
});
assert.equal(dirty?.keyword, "k");
assert.equal(dirty?.targetWords, null, "out-of-range length is dropped");
assert.equal(dirty?.source, "questions");
assert.deepEqual(dirty?.outline, [{ level: 2, text: "A" }, { level: 3, text: "B" }]);
assert.equal(dirty?.questions.length, 3);
assert.equal(dirty?.questions[2].length, 120);
assert.equal("extra" in (dirty as object), false);
assert.equal(sanitizePlanBrief({ keyword: "k", targetWords: 1800 })?.targetWords, 1800);

// win 2: knowledge doc
const profile: ProductProfile = {
  summary: "Hair growth tracker app", audience: ["people with hair loss"], problems: ["hard to see slow progress"],
  features: ["weekly progress photos", "growth timeline"], competitors: [], seedTopics: ["hair growth tracker"], source: "ai", pagesRead: ["https://kellik.app"],
};
const doc = buildProductKnowledgeDoc("Kellik", profile, [{ url: "https://kellik.app/pricing", title: "Pricing", text: "Free plan includes weekly photos. ".repeat(200) }]);
assert.equal(doc.source, PRODUCT_KNOWLEDGE_SOURCE);
assert.equal(doc.title, "Product site: Kellik");
assert.ok(doc.content.includes("- weekly progress photos"));
assert.ok(doc.content.includes("Source: https://kellik.app/pricing"));
assert.ok(doc.content.length <= 20_000);
assert.ok(doc.chunks.length >= 1);
const hits = retrieveKnowledgeChunks([doc], "weekly progress photos pricing", 2);
assert.ok(hits.length > 0 && hits[0].startsWith("Product site: Kellik"), "writer retrieval finds the product doc");

const manual = { title: "Brand guide", content: "x", status: "ready" };
const merged = mergeProductKnowledge([manual, { ...doc, content: "old" }], doc);
assert.equal(merged.length, 2, "re-analyzing replaces the old product doc");
assert.equal(merged[0], manual, "user documents are untouched");
assert.equal((merged[1] as { content: string }).content, doc.content);
assert.equal(mergeProductKnowledge(undefined, doc).length, 1);

// win 5: fill my month
const topic = (keyword: string, cluster: string, score: number, intent: TopicCandidate["intent"], overlap = false): TopicCandidate => ({
  keyword, cluster, score, intent, fit: 0.5, sources: 1, question: false, template: false,
  overlap: overlap ? { title: "Existing", similarity: 0.8 } : null,
});
const pool = [
  topic("a1", "a", 90, "informational"), topic("a2", "a", 85, "informational"),
  topic("b1", "b", 80, "informational"), topic("c1", "c", 79, "informational", true),
  topic("d1", "d", 70, "informational"), topic("e1", "e", 60, "comparison"), topic("f1", "f", 50, "alternatives"),
];
const picked = pickPlanTopics(pool, 4);
assert.deepEqual(picked.map((item) => item.keyword), ["a1", "b1", "e1", "f1"], "breadth first: one per cluster, no overlap, guides capped at half");
const deep = pickPlanTopics([topic("a1", "a", 90, "informational"), topic("a2", "a", 85, "comparison"), topic("a3", "a", 80, "commercial"), topic("a4", "a", 75, "alternatives"), topic("b1", "b", 60, "informational")], 5);
assert.deepEqual(deep.map((item) => item.keyword), ["a1", "a2", "a3", "b1"], "spokes fill remaining slots, at most 3 per cluster");
assert.equal(pickPlanTopics([], 12).length, 0);
assert.equal(pickPlanTopics(pool, 99).some((item) => item.keyword === "c1"), false);

console.log("plan-brief self-test passed");
