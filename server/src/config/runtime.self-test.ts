import assert from "node:assert/strict";
import { resolveMcpEndpoint, resolvePort, validateSelfHostedConfig } from "./runtime.js";

assert.equal(resolvePort("4173"), 4173);
assert.equal(resolvePort("invalid"), 3000);
assert.equal(resolveMcpEndpoint({ WEB_APP_URL: "https://content.example.com" }), "https://content.example.com/mcp");
assert.equal(resolveMcpEndpoint({}, "https://content.example.com/api/mcp/capabilities"), "https://content.example.com/mcp");

const valid = {
  BLOGFACTORY_SELF_HOSTED: "true",
  DATABASE_URL: "postgresql://blogfactory:secret@postgres/blogfactory",
  JWT_SECRET: "jwt-secret",
  API_KEY_ENCRYPTION_SECRET: "encryption-secret",
  CRON_SECRET: "cron-secret",
  ADMIN_EMAILS: "admin@example.com",
  WEB_APP_URL: "https://content.example.com",
  S3_ENDPOINT: "http://minio:9000",
  S3_ACCESS_KEY_ID: "blogfactory",
  S3_SECRET_ACCESS_KEY: "minio-secret",
  S3_BUCKET: "blogfactory",
};
assert.doesNotThrow(() => validateSelfHostedConfig(valid));
assert.throws(() => validateSelfHostedConfig({ ...valid, JWT_SECRET: "change-me-jwt" }), /JWT_SECRET/);
assert.doesNotThrow(() => validateSelfHostedConfig({ NODE_ENV: "production" }));

console.log("runtime configuration self-check passed");
