import assert from "node:assert/strict";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";
const { app } = await import("./index.js");

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

console.log("API route error contract self-check passed");
