import assert from "node:assert/strict";
import { ApiError } from "../http/error-contract.js";
import {
  createMcpAccessToken,
  generateMcpAccessToken,
  hashMcpAccessToken,
  isMcpAccessTokenSecret,
  parseCreateMcpTokenInput,
} from "./mcp-access-tokens.js";

const generated = generateMcpAccessToken();
assert.equal(isMcpAccessTokenSecret(generated.secret), true);
assert.equal(generated.prefix, generated.secret.slice(0, 15));
assert.equal(generated.hash, hashMcpAccessToken(generated.secret));
assert.notEqual(generateMcpAccessToken().secret, generated.secret);

const now = new Date("2026-07-27T12:00:00.000Z");
assert.deepEqual(parseCreateMcpTokenInput({
  name: " Personal Codex ",
  scopes: ["content:read", "drafts:write", "publish:draft", "content:read"],
  site_ids: [
    "11111111-1111-4111-8111-111111111111",
    "11111111-1111-4111-8111-111111111111",
  ],
  expires_at: "2026-08-27T12:00:00.000Z",
}, now), {
  name: "Personal Codex",
  scopes: ["content:read", "drafts:write", "publish:draft"],
  siteIds: ["11111111-1111-4111-8111-111111111111"],
  expiresAt: new Date("2026-08-27T12:00:00.000Z"),
});

for (const body of [
  { name: "", scopes: ["content:read"], site_ids: ["11111111-1111-4111-8111-111111111111"] },
  { name: "Test", scopes: ["drafts:write"], site_ids: ["11111111-1111-4111-8111-111111111111"] },
  { name: "Test", scopes: ["content:read", "publish:live"], site_ids: ["11111111-1111-4111-8111-111111111111"] },
  { name: "Test", scopes: ["content:read"], site_ids: ["not-a-uuid"] },
  { name: "Test", scopes: ["content:read"], site_ids: ["11111111-1111-4111-8111-111111111111"], expires_at: "not-a-date" },
  { name: "Test", scopes: ["content:read"], site_ids: ["11111111-1111-4111-8111-111111111111"], expires_at: now.toISOString() },
]) {
  assert.throws(() => parseCreateMcpTokenInput(body, now), ApiError);
}

await assert.rejects(() => createMcpAccessToken("11111111-1111-4111-8111-111111111111", {
  name: "Bypass attempt",
  scopes: ["drafts:write"],
  siteIds: ["11111111-1111-4111-8111-111111111111"],
  expiresAt: null,
}), ApiError);

console.log("MCP access token self-check passed");
