import assert from "node:assert/strict";
import { placeInlineImages, reflowInlineImages, removeInlineImagePath, replaceInlineImagePath } from "./image-placement.js";

const markdown = [
  "# Title",
  "",
  "Opening paragraph.",
  "",
  "## First",
  "",
  "First section.",
  "",
  "## Second",
  "",
  "Second section.",
].join("\n");

assert.match(placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }], "auto"), /Opening paragraph\.\n\n!\[One]\(one\.webp\)\n\n## First/);
assert.match(placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }, { url: "two.webp", altText: "Two" }], "auto"), /!\[One]\(one\.webp\)\n\n## First/);
assert.match(placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }], "after_intro"), /Opening paragraph\.\n\n!\[One]\(one\.webp\)\n\n## First/);
assert.match(placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }], "between_sections"), /!\[One]\(one\.webp\)\n\n## First/);
assert.equal(placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }], "featured_only"), markdown);
assert.equal(placeInlineImages(`${markdown}\n\n![One](one.webp)`, [{ url: "one.webp", altText: "One" }], "auto").match(/one\.webp/g)?.length, 1);
assert.equal(replaceInlineImagePath(`${markdown}\n\n![Old](old.webp)`, "old.webp", "new.webp").match(/new\.webp/g)?.length, 1);
assert.equal(replaceInlineImagePath(`${markdown}\n\n![Old](old.webp)`, "old.webp", "old.webp").match(/old\.webp/g)?.length, 1);
assert.equal(removeInlineImagePath(`${markdown}\n\n![Old](old.webp)`, "old.webp").includes("old.webp"), false);
assert.equal(removeInlineImagePath(markdown, "missing.webp"), markdown);

const stackedMarkdown = placeInlineImages(
  placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }], "auto"),
  [{ url: "two.webp", altText: "Two" }],
  "auto"
);
const reflowedMarkdown = reflowInlineImages(stackedMarkdown, [{ url: "one.webp" }, { url: "two.webp" }], "auto");
assert.match(reflowedMarkdown, /!\[One]\(one\.webp\)\n\n## First/);
assert.match(reflowedMarkdown, /!\[Two]\(two\.webp\)\n\n## Second/);

console.log("image-placement self-check passed");
