import assert from "node:assert/strict";
import { Hono } from "hono";
import { handleApiError } from "../http/error-contract.js";

process.env.DATABASE_URL ||= "postgres://blogfactory:blogfactory@localhost:5432/blogfactory";
const { createMcpTokenRoutes } = await import("./mcp-tokens.js");

const userId = "11111111-1111-4111-8111-111111111111";
const siteId = "22222222-2222-4222-8222-222222222222";
const calls: Array<{ userId: string; input?: unknown; tokenId?: string }> = [];
const app = new Hono();
app.use("*", async (c, next) => {
  c.set("userId", userId);
  await next();
});
app.route("/", createMcpTokenRoutes({
  list: async (requestedUserId) => {
    calls.push({ userId: requestedUserId });
    return [{
      id: "token-id",
      name: "Personal Codex",
      prefix: "bf_mcp_12345678",
      scopes: ["content:read"],
      site_ids: [siteId],
      expires_at: null,
      last_used_at: null,
      revoked_at: null,
      created_at: new Date("2026-07-27T12:00:00.000Z"),
    }];
  },
  create: async (requestedUserId, input) => {
    calls.push({ userId: requestedUserId, input });
    return {
      token: { id: "token-id", name: input.name, prefix: "bf_mcp_12345678", scopes: input.scopes, site_ids: input.siteIds },
      secret: "bf_mcp_secret-shown-once",
    };
  },
  revoke: async (requestedUserId, tokenId) => {
    calls.push({ userId: requestedUserId, tokenId });
    return { revoked: true };
  },
}));
app.onError(handleApiError);

const listed = await app.request("/");
const listedBody = await listed.json();
assert.equal(listed.status, 200);
assert.equal(JSON.stringify(listedBody).includes("secret"), false);
assert.equal(JSON.stringify(listedBody).includes("tokenHash"), false);
assert.equal(calls.at(-1)?.userId, userId);

const created = await app.request("/", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    name: " Personal Codex ",
    scopes: ["content:read", "drafts:write", "publish:draft"],
    site_ids: [siteId],
    expires_at: null,
  }),
});
assert.equal(created.status, 201);
assert.equal((await created.json() as any).secret, "bf_mcp_secret-shown-once");
assert.deepEqual((calls.at(-1)?.input as any).scopes, ["content:read", "drafts:write", "publish:draft"]);

const invalid = await app.request("/", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Bad", scopes: ["content:read", "publish:live"], site_ids: [siteId] }),
});
assert.equal(invalid.status, 400);

const revoked = await app.request("/33333333-3333-4333-8333-333333333333", { method: "DELETE" });
assert.equal(revoked.status, 200);
assert.deepEqual(await revoked.json(), { revoked: true });
assert.equal(calls.at(-1)?.userId, userId);

console.log("MCP token routes self-check passed");
