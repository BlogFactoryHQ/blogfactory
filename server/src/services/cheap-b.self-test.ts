import assert from "node:assert/strict";
import { extractTerms, termCoverage } from "./term-coverage.js";
import { buildRepurposed, firstSentence, sectionsOf } from "./repurpose.js";
import { buildTopicalMap } from "./topical-map.js";

// ── term coverage ──
const filler = " Readers want clear answers about progress photos, routines and realistic timelines before they decide anything at all.";
const docs = [
  `Minoxidil is a common treatment and a dermatologist usually explains hair growth stages in detail.${filler}`,
  `A dermatologist can review hair growth progress and recommend minoxidil dosage for each person.${filler}`,
  `Hair growth takes months, so photos help; ask a dermatologist about minoxidil side effects early.${filler}`,
  `Pizza dough needs flour, water and yeast. Nothing about scalp health appears here at all.${filler}`,
];
const terms = extractTerms(docs, { keyword: "hair growth tracker" });
const names = terms.map((item) => item.term);
assert.ok(names.includes("minoxidil"), "term shared by most pages");
assert.ok(names.includes("dermatologist"));
assert.equal(names.includes("pizza"), false, "single-page terms are dropped");
assert.equal(names.some((name) => /^hair growth$/.test(name)), false, "keyword terms are excluded");
assert.ok(terms.every((item) => item.docs >= 2));
assert.deepEqual(extractTerms(docs.slice(0, 2)), [], "needs at least three readable pages");
assert.deepEqual(extractTerms(["short", "short", "short"]), [], "tiny pages are ignored");

const covered = termCoverage("Ask your dermatologists about timelines and routines.", [{ term: "dermatologist", docs: 3 }, { term: "minoxidil", docs: 3 }]);
assert.equal(covered.coverage, 50, "plural form counts as covered");
assert.deepEqual(covered.missing.map((item) => item.term), ["minoxidil"]);
assert.equal(termCoverage("anything", []).coverage, 0);
const bigramTerms = [{ term: "progress photos", docs: 3 }];
assert.equal(termCoverage("Take progress photos weekly.", bigramTerms).coverage, 100);
assert.equal(termCoverage("Photos show progress.", bigramTerms).coverage, 0, "bigram needs adjacent words in order");

// ── repurposing ──
const article = `# Hair Growth Tracker Guide

A hair growth tracker helps you see slow progress over months. It keeps every photo and note in one place so nothing is forgotten.

## Why tracking works

Tracking turns a vague feeling into evidence you can compare week by week. Most people notice changes earlier this way.

## How to start

Take a photo in the same light each week. Save a short note about your routine.

### A detail

Sub-heading text that should not become the section sentence at all.

## FAQ

### Is it free?

Yes it is free for the basic plan and includes weekly photos for everyone.

## Final recommendation

Pick a day and start this week with one photo.`;
const sections = sectionsOf(article);
assert.deepEqual(sections.map((item) => item.heading), ["Why tracking works", "How to start"], "FAQ and conclusion sections are skipped");
assert.equal(sections[1].sentence, "Take a photo in the same light each week.");
assert.equal(firstSentence("**Bold** first sentence here. Second one."), "Bold first sentence here.");

const out = buildRepurposed({ title: "Hair Growth Tracker Guide", markdown: article, url: "https://kellik.app/blog/guide" });
assert.equal(out.xThread[0], "Hair Growth Tracker Guide");
assert.ok(out.xThread[1].startsWith("2/ Why tracking works:"));
assert.ok(out.xThread.at(-1)!.includes("https://kellik.app/blog/guide"));
assert.ok(out.xThread.every((tweet) => tweet.length <= 280), "every tweet fits");
assert.ok(out.linkedin.includes("• Why tracking works:"));
assert.ok(out.linkedin.includes("Full guide: https://kellik.app/blog/guide"));
assert.ok(out.linkedin.length <= 1300);
assert.equal(out.newsletter.subject, "Hair Growth Tracker Guide");
assert.ok(out.newsletter.body.includes("Read the full article: https://kellik.app/blog/guide"));

const noUrl = buildRepurposed({ title: "T ".repeat(200), markdown: article });
assert.ok(noUrl.newsletter.body.includes("{{article_url}}"), "placeholder when unpublished");
assert.ok(noUrl.xThread[0].length <= 270, "long titles are cut");
assert.equal(noUrl.xThread.at(-1)!.includes("http"), false);
assert.ok(noUrl.newsletter.subject.length <= 60);
assert.deepEqual(buildRepurposed({ title: "Only", markdown: "" }).xThread.length, 2, "empty article still gives a usable thread");

// ── topical map ──
const item = (id: string, keyword: string, plannedFor: string | null = null) => ({ id, keyword, stage: "planned", plannedFor, postId: null });
const map = buildTopicalMap([
  item("1", "hair growth tracker app", "2026-11-05"),
  item("2", "hair growth tracker"),
  item("3", "Hair Growth Tracker "),
  item("4", "hair growth tracker free", "2026-11-03"),
  item("5", "pizza dough recipe"),
]);
assert.equal(map.total, 4, "duplicates collapse");
assert.equal(map.clusters.length, 2);
assert.equal(map.clusters[0].pillar.keyword, "hair growth tracker", "shortest keyword is the pillar");
assert.deepEqual(map.clusters[0].spokes.map((entry) => entry.keyword).sort(), ["hair growth tracker app", "hair growth tracker free"]);
assert.equal(map.clusters[1].spokes.length, 0);
assert.equal(buildTopicalMap([]).clusters.length, 0);

console.log("cheap-b self-test passed");
