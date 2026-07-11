import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";
process.env.API_KEY_ENCRYPTION_SECRET = "credential-health-good-secret";

const {
  accountCredentialStatus,
  encryptedCredentialStatus,
  encryptSecret,
} = await import("./api-keys.js");
const { serializeIntegration } = await import("./publishing.js");
const { serializeIndexingIntegration } = await import("./indexing.js");
const { serializeSearchConsoleIntegration } = await import("./search-console.js");

const encrypted = encryptSecret("sk-or-test-secret");
assert.equal(encryptedCredentialStatus(encrypted), "usable");
assert.equal(accountCredentialStatus("openrouter", encrypted), "usable");

process.env.API_KEY_ENCRYPTION_SECRET = "credential-health-wrong-secret";
assert.equal(encryptedCredentialStatus(encrypted), "undecryptable");
assert.equal(accountCredentialStatus("openrouter", encrypted), "undecryptable");

process.env.OPENROUTER_API_KEY = "sk-or-env-must-not-mask-user-key";
assert.equal(accountCredentialStatus("openrouter", encrypted), "undecryptable");
assert.equal(encryptedCredentialStatus(encrypted), "undecryptable");

const baseIntegration = {
  id: "integration-id",
  userId: "user-id",
  siteId: "site-id",
  provider: "ghost",
  displayName: "Ghost",
  status: "connected",
  credentialsEncrypted: encrypted,
  credentialHint: "ghost.example",
  config: null,
  lastTestedAt: null,
  lastTestResult: null,
  lastPublishAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
const serializedPublishing = serializeIntegration(baseIntegration as never);
assert.equal(serializedPublishing.credential_status, "undecryptable");
assert.equal(JSON.stringify(serializedPublishing).includes("sk-or-test-secret"), false);

const baseIndexing = {
  ...baseIntegration,
  provider: "bing",
  autoSubmit: true,
  lastSubmitAt: null,
};
assert.equal(serializeIndexingIntegration(baseIndexing as never).credential_status, "undecryptable");

const baseSearchConsole = {
  id: "gsc-id",
  userId: "user-id",
  siteId: "site-id",
  propertyUrl: "https://example.com/",
  status: "connected",
  credentialsEncrypted: encrypted,
  credentialHint: "owner@example.com",
  lastTestedAt: null,
  lastTestResult: null,
  lastSyncAt: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};
assert.equal(serializeSearchConsoleIntegration(baseSearchConsole as never).credential_status, "undecryptable");

console.log("credential health self-check passed");
