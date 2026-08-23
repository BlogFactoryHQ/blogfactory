import assert from "node:assert/strict";
import { resolveMcpEndpoint, resolvePort, validateSelfHostedConfig } from "./runtime.js";

assert.equal(resolvePort("4173"), 4173);
assert.equal(resolvePort("invalid"), 3000);
assert.equal(resolveMcpEndpoint({ WEB_APP_URL: "https://content.example.com" }), "https://content.example.com/mcp");
assert.equal(resolveMcpEndpoint({}, "https://content.example.com/api/mcp/capabilities"), "https://content.example.com/mcp");

const valid = {
  BLOGFACTORY_SELF_HOSTED: "true",
  DATABASE_URL: `postgresql://blogfactory:${"p".repeat(32)}@postgres/blogfactory`,
  JWT_SECRET: "j".repeat(32),
  API_KEY_ENCRYPTION_SECRET: "e".repeat(32),
  CRON_SECRET: "c".repeat(32),
  ADMIN_EMAILS: "admin@example.com",
  WEB_APP_URL: "https://content.example.com",
  MCP_ALLOWED_ORIGINS: "https://content.example.com",
  S3_ENDPOINT: "http://minio:9000",
  S3_ACCESS_KEY_ID: "blogfactory",
  S3_SECRET_ACCESS_KEY: "m".repeat(32),
  S3_BUCKET: "blogfactory",
};
assert.doesNotThrow(() => validateSelfHostedConfig(valid));
assert.throws(() => validateSelfHostedConfig({ ...valid, JWT_SECRET: "change-me-jwt" }), /JWT_SECRET/);
assert.throws(() => validateSelfHostedConfig({ ...valid, CRON_SECRET: "short" }), /CRON_SECRET/);
assert.throws(() => validateSelfHostedConfig({ ...valid, DATABASE_URL: "postgresql://blogfactory:password@postgres/blogfactory" }), /DATABASE_URL/);
assert.throws(() => validateSelfHostedConfig({ ...valid, ADMIN_EMAILS: "not-an-email" }), /ADMIN_EMAILS/);
assert.throws(() => validateSelfHostedConfig({ ...valid, WEB_APP_URL: "content.example.com" }), /WEB_APP_URL/);
assert.throws(() => validateSelfHostedConfig({ ...valid, MCP_ALLOWED_ORIGINS: "https://content.example.com/path" }), /MCP_ALLOWED_ORIGINS/);
assert.doesNotThrow(() => validateSelfHostedConfig({ NODE_ENV: "production" }));

console.log("runtime configuration self-check passed");
