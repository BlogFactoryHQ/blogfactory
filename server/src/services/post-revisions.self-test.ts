import assert from "node:assert/strict";
import { pendingSeoMetadataForContentChange } from "./post-revisions.js";

assert.deepEqual(pendingSeoMetadataForContentChange({ status: "ready", sourceHash: "old", generatedAt: "now", slug: "article" }), {
  status: "pending", sourceHash: "", generatedAt: null, slug: "article", validationErrors: [], error: null,
});
assert.equal(pendingSeoMetadataForContentChange(null), null);

console.log("post revision SEO invalidation self-check passed");
