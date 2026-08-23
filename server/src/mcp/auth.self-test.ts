import assert from "node:assert/strict";
import { generateMcpAccessToken } from "../services/mcp-access-tokens.js";
import { allowedMcpOrigin, authenticateMcpBearer, hasMcpScope } from "./auth.js";

const token = generateMcpAccessToken();
const base = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  tokenHash: token.hash,
  scopes: ["content:read", "drafts:write"],
  siteIds: ["33333333-3333-4333-8333-333333333333"],
  expiresAt: null,
  revokedAt: null,
  email: "editor@example.com",
  displayName: "Editor",
  role: "user",
  approvalStatus: "approved",
};
const touched: Array<{ id: string; at: Date }> = [];
const dependencies = {
  find: async (hash: string) => hash === token.hash ? base : undefined,
  touch: async (id: string, at: Date) => { touched.push({ id, at }); return true; },
};
const now = new Date("2026-07-27T12:00:00.000Z");

const principal = await authenticateMcpBearer(`Bearer ${token.secret}`, dependencies, now);
assert.equal(principal?.userId, base.userId);
assert.deepEqual([...principal!.siteIds], base.siteIds);
assert.equal(hasMcpScope(principal!, "content:read"), true);
assert.deepEqual(touched, [{ id: base.tokenId, at: now }]);

assert.equal(await authenticateMcpBearer(undefined, dependencies, now), null);
assert.equal(await authenticateMcpBearer("Bearer invalid", dependencies, now), null);
assert.equal(await authenticateMcpBearer(`Bearer ${generateMcpAccessToken().secret}`, dependencies, now), null);
assert.equal(await authenticateMcpBearer(`Bearer ${token.secret}`, {
  ...dependencies,
  find: async () => ({ ...base, revokedAt: now }),
}, now), null);
assert.equal(await authenticateMcpBearer(`Bearer ${token.secret}`, {
  ...dependencies,
  find: async () => ({ ...base, expiresAt: now }),
}, now), null);
assert.equal(await authenticateMcpBearer(`Bearer ${token.secret}`, {
  ...dependencies,
  find: async () => ({ ...base, approvalStatus: "pending" }),
}, now), null);
assert.equal(await authenticateMcpBearer(`Bearer ${token.secret}`, {
  ...dependencies,
  touch: async () => false,
}, now), null, "token revoked between lookup and usage update authenticated");

const oauthIdentity = {
  connectionId: "app_consent_01K0BLOGFACTORY",
  userId: base.userId,
  siteId: base.siteIds[0],
};
const oauthDependencies = {
  ...dependencies,
  verifyOAuth: async (secret: string) => secret === "oauth.jwt.token" ? oauthIdentity : null,
  findOAuthUserSite: async (userId: string, siteId: string) => (
    userId === base.userId && siteId === base.siteIds[0]
      ? { ...base, siteId }
      : undefined
  ),
  authorizeOAuth: async () => ({ id: "44444444-4444-4444-8444-444444444444", scopes: ["content:read", "drafts:write", "publish:draft"] }),
};
const oauthPrincipal = await authenticateMcpBearer("Bearer oauth.jwt.token", oauthDependencies, now);
assert.equal(oauthPrincipal?.tokenId, "44444444-4444-4444-8444-444444444444");
assert.equal(oauthPrincipal?.userId, base.userId);
assert.deepEqual([...oauthPrincipal!.scopes], ["content:read", "drafts:write", "publish:draft"]);
assert.deepEqual([...oauthPrincipal!.siteIds], [base.siteIds[0]]);
assert.equal(await authenticateMcpBearer("Bearer other.jwt.token", oauthDependencies, now), null);
assert.equal(await authenticateMcpBearer("Bearer oauth.jwt.token", {
  ...oauthDependencies,
  findOAuthUserSite: async () => undefined,
}, now), null);
assert.equal(await authenticateMcpBearer("Bearer oauth.jwt.token", {
  ...oauthDependencies,
  findOAuthUserSite: async () => ({ ...base, siteId: base.siteIds[0], approvalStatus: "pending" }),
}, now), null);
assert.equal(await authenticateMcpBearer("Bearer oauth.jwt.token", {
  ...oauthDependencies,
  authorizeOAuth: async () => undefined,
}, now), null, "revoked OAuth connection authenticated");

assert.equal(allowedMcpOrigin(new Request("https://blogfactory.io/mcp")), true);
assert.equal(allowedMcpOrigin(new Request("https://blogfactory.io/mcp", { headers: { origin: "https://blogfactory.io" } })), true);
assert.equal(allowedMcpOrigin(new Request("https://blogfactory.io/mcp", { headers: { origin: "https://client.example" } }), "https://client.example"), true);
assert.equal(allowedMcpOrigin(new Request("https://blogfactory.io/mcp", { headers: { origin: "https://evil.example" } })), false);
assert.equal(allowedMcpOrigin(new Request("https://self-hosted.example/mcp", { headers: { origin: "https://blogfactory.io" } }), "https://self-hosted.example", true), false);
assert.equal(allowedMcpOrigin(new Request("https://self-hosted.example/mcp", { headers: { origin: "https://self-hosted.example" } }), "https://self-hosted.example", true), true);

console.log("MCP bearer authentication self-check passed");
