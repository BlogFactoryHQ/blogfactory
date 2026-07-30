import assert from "node:assert/strict";
import { Hono } from "hono";
import { handleApiError } from "../http/error-contract.js";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";
const { createMcpOAuthRoutes } = await import("./mcp-oauth.js");

const userId = "11111111-1111-4111-8111-111111111111";
const calls: Array<{ action: string; userId: string; value?: unknown }> = [];
const app = new Hono();
app.use("*", async (c, next) => {
  c.set("userId", userId);
  await next();
});
app.route("/", createMcpOAuthRoutes({
  complete: async (requestedUserId, externalAuthId) => {
    calls.push({ action: "complete", userId: requestedUserId, value: externalAuthId });
    return { redirect_uri: "https://blogfactory-test.authkit.app/continue" };
  },
  list: async (requestedUserId) => {
    calls.push({ action: "list", userId: requestedUserId });
    return [{ id: "connection-id", scopes: ["content:read"] }];
  },
  revoke: async (requestedUserId, connectionId) => {
    calls.push({ action: "revoke", userId: requestedUserId, value: connectionId });
    return { revoked: true };
  },
}));
app.onError(handleApiError);

const completed = await app.request("/complete", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ external_auth_id: "ext_auth_01K0BLOGFACTORY" }),
});
assert.equal(completed.status, 200);
assert.equal(calls.at(-1)?.userId, userId);
assert.equal(calls.at(-1)?.value, "ext_auth_01K0BLOGFACTORY");

const listed = await app.request("/connections");
assert.deepEqual(await listed.json(), {
  connections: [{ id: "connection-id", scopes: ["content:read"] }],
});

const revoked = await app.request("/connections/22222222-2222-4222-8222-222222222222", {
  method: "DELETE",
});
assert.deepEqual(await revoked.json(), { revoked: true });
assert.equal(calls.at(-1)?.value, "22222222-2222-4222-8222-222222222222");

console.log("MCP OAuth routes self-check passed");
