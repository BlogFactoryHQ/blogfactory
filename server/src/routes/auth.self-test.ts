import assert from "node:assert/strict";
import { publicSignupEnabled } from "./auth.js";

assert.equal(publicSignupEnabled("production"), false);
assert.equal(publicSignupEnabled("development"), true);

console.log("auth signup gate self-test ok");
