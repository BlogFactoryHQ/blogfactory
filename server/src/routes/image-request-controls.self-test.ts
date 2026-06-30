import assert from "node:assert/strict";
import { canRestartImageRequest } from "./image-request-controls.js";

assert.equal(canRestartImageRequest("ai-deferred", "failed"), true);
assert.equal(canRestartImageRequest("ai-deferred", "processing"), true);
assert.equal(canRestartImageRequest("ai-deferred", "queued"), true);
assert.equal(canRestartImageRequest("ai-deferred", "pending"), true);
assert.equal(canRestartImageRequest("ai-deferred", "done"), false);
assert.equal(canRestartImageRequest("pexels", "failed"), false);

console.log("image request controls self-test ok");
