import assert from "node:assert/strict";
import { Hono } from "hono";
import { ApiError, codeForStatus, errorResponse, handleApiError, normalizeApiErrors, readJsonObject, requiredEnum, requiredStringArray, safeError } from "./error-contract.js";

const app = new Hono();
app.use("*", normalizeApiErrors);
app.post("/json", async (c) => c.json(await readJsonObject(c)));
app.get("/legacy", (c) => c.json({ error: "Missing item" }, 404));
app.get("/invalid", () => { throw new ApiError(400, "validation_error", "Invalid status", [{ field: "status", message: "Invalid" }]); });
app.get("/unexpected", () => { throw new Error("database password must not leak"); });
app.notFound((c) => errorResponse(c, 404, "not_found", "API route not found"));
app.onError(handleApiError);

const malformed = await app.request("/json", { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
assert.equal(malformed.status, 400);
assert.deepEqual(await malformed.json(), { error: "Request body must contain valid JSON", code: "invalid_json", message: "Request body must contain valid JSON" });

const legacy = await app.request("/legacy");
assert.deepEqual(await legacy.json(), { error: "Missing item", code: "not_found", message: "Missing item" });
assert.deepEqual(await (await app.request("/missing")).json(), { error: "API route not found", code: "not_found", message: "API route not found" });

const invalid = await app.request("/invalid");
assert.deepEqual(await invalid.json(), { error: "Invalid status", code: "validation_error", message: "Invalid status", details: [{ field: "status", message: "Invalid" }] });

const originalConsoleError = console.error;
let unexpectedLogged = false;
console.error = () => { unexpectedLogged = true; };
const unexpected = await app.request("/unexpected");
console.error = originalConsoleError;
assert.equal(unexpected.status, 500);
assert.doesNotMatch(JSON.stringify(await unexpected.json()), /password|database/i);
assert.equal(unexpectedLogged, true);

assert.equal(codeForStatus(401), "unauthorized");
assert.equal(codeForStatus(403), "forbidden");
assert.equal(codeForStatus(404), "not_found");
assert.equal(codeForStatus(409), "conflict");
assert.equal(codeForStatus(429), "rate_limited");
assert.equal(codeForStatus(502), "upstream_failure");
const privateError = Object.assign(new Error("Failed query: select secret\nparams: private-content"), {
  code: "QUERY_FAILED",
  cause: Object.assign(new Error("private provider response"), { code: "22000" }),
});
const safe = JSON.stringify(safeError(privateError));
assert.equal(safe.includes("private-content"), false);
assert.equal(safe.includes("provider response"), false);
assert.deepEqual(JSON.parse(safe), { name: "Error", code: "QUERY_FAILED", causeName: "Error", causeCode: "22000" });
assert.throws(() => requiredEnum({ status: "bad" }, "status", ["draft", "published"] as const), /Invalid status/);
assert.throws(() => requiredStringArray({ ids: [] }, "ids"), /at least one/);

console.log("API error contract self-check passed");
