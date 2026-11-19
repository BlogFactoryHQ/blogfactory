import assert from "node:assert/strict";
import { analyzeContent, countSyllables, shingleSimilarity, shingles } from "./content-analysis.js";
import { buildArticleJsonLd, buildFaqJsonLd, buildLlmsTxt, extractFaq } from "./structured-data.js";

const article = `# Hair growth tracker guide

A hair growth tracker helps you see slow progress. The tracker is simple to use and the app keeps your photos in one place for the whole year.

## Why track hair growth

Tracking hair growth gives you real data instead of guesses. It is easy to forget how your hair looked three months ago, and that is why photos matter.

## How to start

- Take a photo
- Repeat weekly

## FAQ

### Does a hair growth tracker work?

Yes, a tracker works because it shows small changes over time that the mirror hides from you every day.

### Is it free?

The basic plan is free and covers progress photos and weekly reminders for everyone.
`;

const filler = "Photos taken in the same light every week make small changes visible to you and to anyone you show them to. ".repeat(10);
const analysis = analyzeContent(`${article}\n\n${filler}`, { keyword: "hair growth tracker", title: "Hair growth tracker guide" });
assert.equal(analysis.keyword?.inTitle, true);
assert.equal(analysis.keyword?.inFirst100, true);
assert.equal(analysis.keyword?.stuffing, false);
assert.equal(analysis.structure.h2, 3);
assert.equal(analysis.structure.lists, 2);
assert.ok(analysis.words > 60);

const stuffed = analyzeContent("hair tool. ".repeat(40), { keyword: "hair tool" });
assert.equal(stuffed.keyword?.stuffing, true);
assert.ok(stuffed.flags.some((flag) => flag.includes("stuffed")));

const ai = analyzeContent("In today's fast-paced world we delve into the topic. It's important to note that results vary.");
assert.ok(ai.aiPatterns.count >= 3);

assert.equal(countSyllables("tracker"), 2);
const copy = analyzeContent(article, { siblings: [{ id: "a", title: "Same post", content: article }, { id: "b", title: "Other", content: "Completely different pizza dough recipe with flour water yeast and salt for the kitchen." }] });
assert.equal(copy.duplicates[0]?.id, "a");
assert.ok(copy.duplicates[0].similarity > 0.9);
assert.equal(copy.duplicates.some((item) => item.id === "b"), false);
assert.equal(analyzeContent(article, { siblings: [{ id: "a", title: "Same", content: article }], ownId: "a" }).duplicates.length, 0);
assert.equal(shingleSimilarity(shingles("a b c d e"), shingles("a b c d e")), 1);

const faq = extractFaq(article);
assert.equal(faq.length, 2);
assert.equal(faq[0].question, "Does a hair growth tracker work?");
const faqLd = buildFaqJsonLd(faq);
assert.equal(faqLd?.["@type"], "FAQPage");
assert.equal(buildFaqJsonLd([]), null);

const ld = buildArticleJsonLd({ title: "T", description: null, url: "https://x.com/a", publisherName: "Kellik" });
assert.equal(ld["@type"], "BlogPosting");
assert.equal("description" in ld, false);

const llms = buildLlmsTxt({
  name: "Kellik", summary: "Hair growth tracker",
  pages: [{ title: "Home", url: "https://kellik.app/" }, { title: "Home again", url: "https://kellik.app/" }],
  posts: [{ title: "Guide [new]", url: "https://kellik.app/blog/guide", description: "How to track" }],
});
assert.ok(llms.startsWith("# Kellik\n\n> Hair growth tracker"));
assert.equal(llms.match(/kellik\.app\/\)/g)?.length, 1, "duplicate URLs collapse");
assert.ok(llms.includes("- [Guide new](https://kellik.app/blog/guide): How to track"));

console.log("content-analysis self-test passed");
