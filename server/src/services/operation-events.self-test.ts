import assert from "node:assert/strict";
import { OPERATION_RETENTION_MS, safeOperationMetadata } from "./operation-events.js";

assert.equal(OPERATION_RETENTION_MS, 30 * 24 * 60 * 60 * 1000);
assert.deepEqual(safeOperationMetadata("generate_draft", {
  source_type: "raw_text",
  source_value: "private article body",
  custom_instructions: "private prompt",
  api_key: "secret",
  variations: 2,
}), { source_type: "raw_text", variations: 2, source_length: 20 });
assert.deepEqual(safeOperationMetadata("push_to_cms_draft", {
  post_type: "post",
  token: "secret",
  provider_response: { private: true },
}), { post_type: "post" });

console.log("operation event redaction self-check passed");
