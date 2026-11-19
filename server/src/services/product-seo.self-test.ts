import assert from "node:assert/strict";
import {
  buildSeedQueries,
  classifyIntent,
  findOverlap,
  templateTopics,
  topicSimilarity,
  clusterKeywords,
  heuristicProfile,
  normalizeProfile,
  parseProfileJson,
  productFit,
  rankTopics,
} from "./product-seo.js";

assert.equal(classifyIntent("notion alternatives"), "alternatives");
assert.equal(classifyIntent("kellik vs notion"), "comparison");
assert.equal(classifyIntent("best hair loss tracker app"), "commercial");
assert.equal(classifyIntent("how to track hair growth"), "informational");

const profile = normalizeProfile({
  summary: "  Hair growth tracker app ",
  features: ["progress photos", "hair growth tracking", "progress photos"],
  problems: ["hair loss"],
  competitors: ["Hairmetric"],
  seedTopics: ["hair growth tracker", "hair loss progress"],
}, ["https://kellik.app"], "ai");
assert.equal(profile.summary, "Hair growth tracker app");
assert.deepEqual(profile.features, ["progress photos", "hair growth tracking"]);

assert.ok(productFit("hair growth tracker app", profile) > productFit("best pizza near me", profile));
assert.ok(productFit("hairmetric alternative", profile) >= 0.3, "competitor mentions count as product fit");

const queries = buildSeedQueries(["hair growth tracker"], ["Hairmetric"]);
assert.ok(queries.includes("hair growth tracker"));
assert.ok(queries.includes("how to hair growth tracker"));
assert.ok(queries.includes("can hair growth tracker"));
assert.ok(queries.includes("Hairmetric alternative"));

const clusters = clusterKeywords(["hair growth tracker", "hair growth tracker app", "pizza dough recipe"]);
assert.equal(clusters.length, 2);
assert.equal(clusters[0].label, "hair growth tracker");

const ranked = rankTopics([
  { keyword: "hair growth tracker app", position: 0, hits: 3 },
  { keyword: "hair growth tracker app", position: 2, hits: 1 },
  { keyword: "pizza dough recipe", position: 0, hits: 1 },
  { keyword: "hair", position: 0, hits: 1 },
], profile);
assert.equal(ranked[0].keyword, "hair growth tracker app");
assert.equal(ranked.some((topic) => topic.keyword === "hair"), false, "single-token queries are dropped");
assert.equal(ranked[0].sources, 4, "duplicate suggestions merge");

assert.equal(parseProfileJson("not json", []), null);
assert.equal(parseProfileJson('```json\n{"summary":"x","seedTopics":["a b"]}\n```', ["u"])?.seedTopics[0], "a b");

const fallback = heuristicProfile({ title: "Kellik | Track hair growth", description: "Track your progress", headings: ["Progress photos", "Daily routine"] }, ["u"]);
assert.equal(fallback.source, "heuristic");
assert.equal(fallback.seedTopics[0], "Kellik");

assert.equal(findOverlap("hair growth tracker app", ["Hair Growth Tracker Apps", "pizza"])?.title, "Hair Growth Tracker Apps");
assert.equal(findOverlap("minoxidil beard guide", ["Hair Growth Tracker Apps"]), null);
assert.ok(topicSimilarity("hair growth tracker", "hair growth tracking") >= 0.7);
assert.equal(findOverlap("hair growth tracker shirt", ["Best Hair Growth Tracker"]), null, "one swapped word is not a duplicate");

const templates = templateTopics(profile, "Kellik");
assert.ok(templates.includes("hairmetric alternatives"));
assert.ok(templates.includes("kellik vs hairmetric"));

const withContext = rankTopics(
  [{ keyword: "hair growth tracker app", position: 0, hits: 3 }, { keyword: "how does hair growth tracker work", position: 1, hits: 1 }],
  profile, 40, { existingTitles: ["Hair Growth Tracker App"], templates },
);
const dup = withContext.find((topic) => topic.keyword === "hair growth tracker app");
assert.ok(dup?.overlap, "existing page overlap is flagged");
assert.equal(withContext.find((topic) => topic.keyword === "kellik vs hairmetric")?.template, true);
assert.equal(withContext.find((topic) => topic.keyword === "how does hair growth tracker work")?.question, true);
assert.ok(withContext.indexOf(dup!) > 0, "overlapping topics sink below fresh ones");

// covered topics stay visible even when the limit would cut them
const many = Array.from({ length: 6 }, (_, i) => ({ keyword: `hair growth ideas${i} routine`, position: 0, hits: 3 }));
const limited = rankTopics([...many, { keyword: "hair growth tracker app", position: 0, hits: 3 }], profile, 3, { existingTitles: ["Hair Growth Tracker App"] });
assert.equal(limited.filter((topic) => !topic.overlap).length, 3, "limit applies to fresh topics");
assert.ok(limited.some((topic) => topic.overlap), "the covered topic is still listed");
assert.equal(limited.at(-1)?.overlap !== null, true, "covered topics sort last");

console.log("product-seo self-test passed");
