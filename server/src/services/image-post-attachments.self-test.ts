import assert from "node:assert/strict";
import { seoPatchForContentChange } from "./image-post-attachments.js";

const ready = { status: "ready", sourceHash: "old", generatedAt: "now", slug: "article" };

assert.deepEqual(seoPatchForContentChange("body", "body", ready), {});
assert.deepEqual(seoPatchForContentChange("body", "body without image", ready), {
  seoMetadata: { status: "pending", sourceHash: "", generatedAt: null, slug: "article", validationErrors: [], error: null },
});
assert.deepEqual(seoPatchForContentChange("", "body", null), { seoMetadata: null });

console.log("image attachment SEO invalidation self-check passed");
