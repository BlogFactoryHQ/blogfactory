import assert from "node:assert/strict";
import { createCipheriv, createHash, randomBytes } from "node:crypto";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";
process.env.API_KEY_ENCRYPTION_SECRET = "credential-health-good-secret";

const {
  accountCredentialStatus,
  decryptSecret,
  encryptedCredentialStatus,
  encryptSecret,
  reencryptSecret,
  secretNeedsReencryption,
  testedConnectionReady,
} = await import("./api-keys.js");
const { serializeIntegration } = await import("./publishing.js");
const { serializeIndexingIntegration } = await import("./indexing.js");
const { serializeSearchConsoleIntegration } = await import("./search-console.js");

function legacyEncrypt(value: string, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(":");
}

const encrypted = encryptSecret("sk-or-test-secret");
assert.match(encrypted, /^v2:[0-9a-f]{12}:/);
assert.equal(encryptedCredentialStatus(encrypted), "usable");
assert.equal(accountCredentialStatus("openrouter", encrypted), "usable");
assert.equal(testedConnectionReady({ status: "connected", lastTestedAt: new Date(), credentialsEncrypted: encrypted }), true);
assert.equal(testedConnectionReady({ status: "connected", lastTestedAt: null, credentialsEncrypted: encrypted }), false);

process.env.API_KEY_ENCRYPTION_SECRET = "credential-health-rotated-secret";
process.env.API_KEY_ENCRYPTION_PREVIOUS_SECRETS = "credential-health-good-secret";
assert.equal(decryptSecret(encrypted), "sk-or-test-secret");
assert.equal(decryptSecret(legacyEncrypt("legacy-secret", "credential-health-good-secret")), "legacy-secret");
assert.equal(secretNeedsReencryption(encrypted), true);
const rotated = reencryptSecret(encrypted);
assert.equal(decryptSecret(rotated), "sk-or-test-secret");
assert.equal(secretNeedsReencryption(rotated), false);

delete process.env.API_KEY_ENCRYPTION_PREVIOUS_SECRETS;
assert.equal(encryptedCredentialStatus(encrypted), "undecryptable");
assert.equal(accountCredentialStatus("openrouter", encrypted), "undecryptable");
assert.equal(testedConnectionReady({ status: "connected", lastTestedAt: new Date(), credentialsEncrypted: encrypted }), false);

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
assert.equal(serializedPublishing.ready, false);
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
