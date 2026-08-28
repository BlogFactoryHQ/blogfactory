import assert from "node:assert/strict";
import { ApiError } from "../http/error-contract.js";
import { MCP_OAUTH_SITE_IDS_CLAIM } from "../mcp/oauth.js";
import { completeMcpOAuthLogin } from "./mcp-oauth.js";

const userId = "22222222-2222-4222-8222-222222222222";
const siteId = "33333333-3333-4333-8333-333333333333";
const secondSiteId = "44444444-4444-4444-8444-444444444444";
let requestBody: Record<string, any> | undefined;
const dependencies = {
  env: {
    WORKOS_AUTHKIT_ISSUER: "https://blogfactory-test.authkit.app",
    MCP_RESOURCE_URL: "https://blogfactory.io/mcp",
    WORKOS_API_KEY: "sk_test_not_a_real_secret",
  },
  loadAccount: async () => ({
    id: userId,
    email: "editor@example.com",
    sites: [
      { id: siteId, name: "Ortakalan", domain: "ortakalan.io" },
      { id: secondSiteId, name: "Ideal Plastik", domain: "idealplastik.com.tr" },
    ],
  }),
  request: async (_input: string | URL | Request, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({
      redirect_uri: "https://blogfactory-test.authkit.app/oauth2/authorize/continue",
    });
  },
};

assert.deepEqual(
  await completeMcpOAuthLogin(userId, "ext_auth_01K0BLOGFACTORY", [siteId, secondSiteId], dependencies),
  { redirect_uri: "https://blogfactory-test.authkit.app/oauth2/authorize/continue" },
);
assert.deepEqual(requestBody?.user, { id: userId, email: "editor@example.com" });
assert.deepEqual(requestBody?.user_consent_options, [{
  claim: MCP_OAUTH_SITE_IDS_CLAIM,
  type: "enum",
  label: "BlogFactory sites",
  choices: [{
    value: JSON.stringify([siteId, secondSiteId]),
    label: "Ortakalan — ortakalan.io, Ideal Plastik — idealplastik.com.tr",
  }],
}]);
assert.equal(JSON.stringify(requestBody).includes("sk_test_not_a_real_secret"), false);

await assert.rejects(
  completeMcpOAuthLogin(userId, "../bad", [siteId], dependencies),
  (error: unknown) => error instanceof ApiError && error.status === 400,
);
await assert.rejects(
  completeMcpOAuthLogin(userId, "ext_auth_01K0BLOGFACTORY", [siteId], {
    ...dependencies,
    loadAccount: async () => ({ id: userId, email: "editor@example.com", sites: [] }),
  }),
  (error: unknown) => error instanceof ApiError && error.status === 409,
);
await assert.rejects(
  completeMcpOAuthLogin(userId, "ext_auth_01K0BLOGFACTORY", [siteId], {
    ...dependencies,
    request: async () => Response.json({ redirect_uri: "https://evil.example/steal" }),
  }),
  (error: unknown) => error instanceof ApiError && error.status === 502,
);
await assert.rejects(
  completeMcpOAuthLogin(userId, "ext_auth_01K0BLOGFACTORY", [siteId], {
    ...dependencies,
    request: async () => Response.json({ error: "raw provider details" }, { status: 400 }),
  }),
  (error: unknown) => (
    error instanceof ApiError
    && error.status === 400
    && !error.message.includes("raw provider details")
  ),
);
await assert.rejects(
  completeMcpOAuthLogin(userId, "ext_auth_01K0BLOGFACTORY", ["55555555-5555-4555-8555-555555555555"], dependencies),
  (error: unknown) => error instanceof ApiError && error.status === 403,
);

console.log("MCP OAuth completion self-check passed");
