import assert from "node:assert/strict";
import { assertCloudLaunchConfigured, readinessStatus } from "./readiness.js";

assert.throws(() => assertCloudLaunchConfigured({ BLOGFACTORY_CLOUD: "true" }), /WORKOS_API_KEY/);
assert.doesNotThrow(() => assertCloudLaunchConfigured({
  BLOGFACTORY_CLOUD: "true",
  WORKOS_API_KEY: "test-key",
  WORKOS_CLIENT_ID: "test-client",
  WORKOS_COOKIE_PASSWORD: "x".repeat(32),
  WORKOS_REDIRECT_URI: "https://app.example.com/api/auth/workos/callback",
  WORKOS_AUTHKIT_ISSUER: "https://example.authkit.app",
  MCP_RESOURCE_URL: "https://example.com/mcp",
}));

assert.deepEqual(await readinessStatus([async () => true, async () => true]), { ready: true, status: 200 });
assert.deepEqual(await readinessStatus([async () => { throw new Error("secret database detail"); }]), { ready: false, status: 503 });

console.log("readiness self-check passed");
