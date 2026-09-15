import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";
const { app } = await import("./index.js");

const authConfig = await app.request("/api/auth/config");
assert.equal(authConfig.status, 200);
assert.deepEqual(await authConfig.json(), { signup_enabled: true, auth_provider: "local" });

const malformed = await app.request("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{",
});
assert.equal(malformed.status, 400);
assert.deepEqual(await malformed.json(), {
  error: "Request body must contain valid JSON",
  code: "invalid_json",
  message: "Request body must contain valid JSON",
});

const missingPassword = await app.request("/api/auth/login", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "editor@example.com" }),
});
assert.equal(missingPassword.status, 400);
assert.deepEqual(await missingPassword.json(), {
  error: "password is required",
  code: "validation_error",
  message: "password is required",
  details: [{ field: "password", message: "Required" }],
});

const forbidden = await app.request("/api/auth/google", { method: "POST" });
assert.equal(forbidden.status, 403);
assert.deepEqual(await forbidden.json(), {
  error: "Google sign-in is disabled during the private beta",
  code: "forbidden",
  message: "Google sign-in is disabled during the private beta",
});

const previousCloud = process.env.BLOGFACTORY_CLOUD;
process.env.BLOGFACTORY_CLOUD = "true";
const hostedConfig = await app.request("/api/auth/config");
assert.deepEqual(await hostedConfig.json(), { signup_enabled: false, auth_provider: "workos" });
const hostedLocalLogin = await app.request("/api/auth/login", { method: "POST" });
assert.equal(hostedLocalLogin.status, 404);
if (previousCloud === undefined) delete process.env.BLOGFACTORY_CLOUD;
else process.env.BLOGFACTORY_CLOUD = previousCloud;

const previousWebhookSecret = process.env.POLAR_WEBHOOK_SECRET;
process.env.POLAR_WEBHOOK_SECRET = "test-webhook-secret";
const missingWebhookId = await app.request("/api/webhooks/polar", { method: "POST", body: "{}" });
assert.equal(missingWebhookId.status, 400);
const invalidWebhookSignature = await app.request("/api/webhooks/polar", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "webhook-id": "test-event",
    "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
    "webhook-signature": "v1,invalid",
  },
  body: "{}",
});
assert.equal(invalidWebhookSignature.status, 403);
if (previousWebhookSecret === undefined) delete process.env.POLAR_WEBHOOK_SECRET;
else process.env.POLAR_WEBHOOK_SECRET = previousWebhookSecret;

console.log("API route error contract self-check passed");
