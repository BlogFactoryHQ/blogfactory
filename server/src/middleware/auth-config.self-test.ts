import assert from "node:assert/strict";
import { resolveJwtSecret } from "./auth.js";

assert.equal(resolveJwtSecret("", "development"), "dev-secret");
assert.equal(resolveJwtSecret("configured-secret", "production"), "configured-secret");
assert.throws(() => resolveJwtSecret("", "production"), /must be configured/);
assert.throws(() => resolveJwtSecret("changeme-generate-a-random-secret", "production"), /must be configured/);

console.log("Authentication configuration self-check passed");
