import assert from "node:assert/strict";
import { placeInlineImages } from "./image-placement.js";

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

console.log("image-placement self-check passed");
