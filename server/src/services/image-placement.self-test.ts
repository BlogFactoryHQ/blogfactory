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

assert.equal(placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }], "auto"), markdown);
assert.match(placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }], "after_intro"), /Opening paragraph\.\n\n!\[One]\(one\.webp\)\n\n## First/);
assert.match(placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }], "between_sections"), /!\[One]\(one\.webp\)\n\n## First/);
assert.equal(placeInlineImages(markdown, [{ url: "one.webp", altText: "One" }], "featured_only"), markdown);

console.log("image-placement self-check passed");
