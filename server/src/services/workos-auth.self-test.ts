import assert from "node:assert/strict";
import { safeAuthReturnTo, workosCloudEnabled } from "./workos-auth.js";

assert.equal(safeAuthReturnTo("/billing?from=auth"), "/billing?from=auth");
assert.equal(safeAuthReturnTo("//evil.example"), "/");
assert.equal(safeAuthReturnTo("/\\evil"), "/");
assert.equal(workosCloudEnabled({ BLOGFACTORY_CLOUD: "true", WORKOS_API_KEY: "key", WORKOS_CLIENT_ID: "client", WORKOS_COOKIE_PASSWORD: "12345678901234567890123456789012", WORKOS_REDIRECT_URI: "https://app.example/callback" } as NodeJS.ProcessEnv), true);
assert.equal(workosCloudEnabled({ BLOGFACTORY_CLOUD: "true", WORKOS_API_KEY: "key", WORKOS_CLIENT_ID: "client", WORKOS_COOKIE_PASSWORD: "too-short", WORKOS_REDIRECT_URI: "https://app.example/callback" } as NodeJS.ProcessEnv), false);
assert.equal(workosCloudEnabled({ BLOGFACTORY_CLOUD: "false" } as NodeJS.ProcessEnv), false);

console.log("WorkOS Cloud auth self-test passed");
