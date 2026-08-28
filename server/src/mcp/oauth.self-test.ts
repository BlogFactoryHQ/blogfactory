import assert from "node:assert/strict";
import {
  SignJWT,
  createLocalJWKSet,
  errors,
  exportJWK,
  generateKeyPair,
} from "jose";
import {
  MCP_OAUTH_SITE_ID_CLAIM,
  MCP_OAUTH_SITE_IDS_CLAIM,
  MCP_OAUTH_USER_ID_CLAIM,
  getMcpOAuthConfig,
  handleMcpProtectedResourceMetadata,
  isInvalidMcpOAuthTokenError,
  mcpBearerChallenge,
  mcpOAuthIdentityFromClaims,
  mcpProtectedResourceMetadata,
  verifyMcpOAuthAccessToken,
} from "./oauth.js";

const config = getMcpOAuthConfig({
  WORKOS_AUTHKIT_ISSUER: "https://blogfactory-test.authkit.app",
  MCP_RESOURCE_URL: "https://blogfactory.io/mcp",
  WORKOS_API_KEY: "sk_test_not_a_real_secret",
});
assert.deepEqual(config, {
  issuer: "https://blogfactory-test.authkit.app",
  resource: "https://blogfactory.io/mcp",
  jwksUrl: "https://blogfactory-test.authkit.app/oauth2/jwks",
  protectedResourceMetadataUrl: "https://blogfactory.io/.well-known/oauth-protected-resource",
});
assert.deepEqual(mcpProtectedResourceMetadata(config!), {
  resource: "https://blogfactory.io/mcp",
  authorization_servers: ["https://blogfactory-test.authkit.app"],
  scopes_supported: ["openid", "profile", "email", "offline_access"],
  bearer_methods_supported: ["header"],
});
assert.equal(
  mcpBearerChallenge(config),
  'Bearer resource_metadata="https://blogfactory.io/.well-known/oauth-protected-resource", scope="openid profile email offline_access"',
);
assert.equal(getMcpOAuthConfig({}), null);
assert.throws(() => getMcpOAuthConfig({
  WORKOS_AUTHKIT_ISSUER: "https://blogfactory-test.authkit.app",
}), /requires WORKOS_AUTHKIT_ISSUER, MCP_RESOURCE_URL, and WORKOS_API_KEY/);
assert.throws(() => getMcpOAuthConfig({
  WORKOS_AUTHKIT_ISSUER: "http://blogfactory-test.authkit.app",
  MCP_RESOURCE_URL: "https://blogfactory.io/mcp",
  WORKOS_API_KEY: "sk_test_not_a_real_secret",
}), /HTTPS origin/);
assert.throws(() => getMcpOAuthConfig({
  WORKOS_AUTHKIT_ISSUER: "https://blogfactory-test.authkit.app",
  MCP_RESOURCE_URL: "https://blogfactory.io/not-mcp",
  WORKOS_API_KEY: "sk_test_not_a_real_secret",
}), /HTTPS \/mcp URL/);

const claims = {
  sid: "app_consent_01K0BLOGFACTORY",
  [MCP_OAUTH_USER_ID_CLAIM]: "22222222-2222-4222-8222-222222222222",
  [MCP_OAUTH_SITE_ID_CLAIM]: "33333333-3333-4333-8333-333333333333",
};
assert.deepEqual(mcpOAuthIdentityFromClaims(claims), {
  connectionId: claims.sid,
  userId: claims[MCP_OAUTH_USER_ID_CLAIM],
  siteIds: [claims[MCP_OAUTH_SITE_ID_CLAIM]],
});
assert.equal(mcpOAuthIdentityFromClaims({ ...claims, [MCP_OAUTH_SITE_ID_CLAIM]: "other-site" }), null);
const secondSiteId = "44444444-4444-4444-8444-444444444444";
assert.deepEqual(mcpOAuthIdentityFromClaims({
  ...claims,
  [MCP_OAUTH_SITE_ID_CLAIM]: undefined,
  [MCP_OAUTH_SITE_IDS_CLAIM]: [secondSiteId, claims[MCP_OAUTH_SITE_ID_CLAIM]],
}), {
  connectionId: claims.sid,
  userId: claims[MCP_OAUTH_USER_ID_CLAIM],
  siteIds: [claims[MCP_OAUTH_SITE_ID_CLAIM], secondSiteId],
});
assert.deepEqual(mcpOAuthIdentityFromClaims({
  ...claims,
  [MCP_OAUTH_SITE_ID_CLAIM]: undefined,
  [MCP_OAUTH_SITE_IDS_CLAIM]: JSON.stringify([claims[MCP_OAUTH_SITE_ID_CLAIM], secondSiteId]),
})?.siteIds, [claims[MCP_OAUTH_SITE_ID_CLAIM], secondSiteId]);
assert.equal(mcpOAuthIdentityFromClaims({ ...claims, [MCP_OAUTH_SITE_IDS_CLAIM]: [] }), null);
assert.equal(mcpOAuthIdentityFromClaims({ ...claims, sid: undefined }), null);
assert.equal(isInvalidMcpOAuthTokenError(new errors.JWTInvalid("invalid token")), true);
assert.equal(isInvalidMcpOAuthTokenError(new errors.JOSEError("JWKS fetch failed")), false);
assert.equal(isInvalidMcpOAuthTokenError(new errors.JWKSTimeout()), false);

const { publicKey, privateKey } = await generateKeyPair("RS256");
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = "test-rs256";
publicJwk.alg = "RS256";
const localKeys = createLocalJWKSet({ keys: [publicJwk] });
const signAccessToken = (issuer: string, audience: string) => new SignJWT(claims)
  .setProtectedHeader({ alg: "RS256", kid: publicJwk.kid })
  .setIssuer(issuer)
  .setAudience(audience)
  .setIssuedAt()
  .setExpirationTime("5m")
  .sign(privateKey);
assert.deepEqual(
  await verifyMcpOAuthAccessToken(
    await signAccessToken(config!.issuer, config!.resource),
    config,
    localKeys,
  ),
  mcpOAuthIdentityFromClaims(claims),
);
assert.equal(
  await verifyMcpOAuthAccessToken(
    await signAccessToken("https://wrong-issuer.example", config!.resource),
    config,
    localKeys,
  ),
  null,
);
assert.equal(
  await verifyMcpOAuthAccessToken(
    await signAccessToken(config!.issuer, "https://blogfactory.io/other"),
    config,
    localKeys,
  ),
  null,
);
const { publicKey: ecPublicKey, privateKey: ecPrivateKey } = await generateKeyPair("ES256");
const ecJwk = await exportJWK(ecPublicKey);
ecJwk.kid = "test-es256";
ecJwk.alg = "ES256";
const wrongAlgorithmToken = await new SignJWT(claims)
  .setProtectedHeader({ alg: "ES256", kid: ecJwk.kid })
  .setIssuer(config!.issuer)
  .setAudience(config!.resource)
  .setIssuedAt()
  .setExpirationTime("5m")
  .sign(ecPrivateKey);
assert.equal(
  await verifyMcpOAuthAccessToken(wrongAlgorithmToken, config, createLocalJWKSet({ keys: [ecJwk] })),
  null,
);

const previousIssuer = process.env.WORKOS_AUTHKIT_ISSUER;
const previousResource = process.env.MCP_RESOURCE_URL;
const previousApiKey = process.env.WORKOS_API_KEY;
delete process.env.WORKOS_AUTHKIT_ISSUER;
delete process.env.MCP_RESOURCE_URL;
delete process.env.WORKOS_API_KEY;
assert.equal((await handleMcpProtectedResourceMetadata()).status, 404);
process.env.WORKOS_AUTHKIT_ISSUER = "https://blogfactory-test.authkit.app";
process.env.MCP_RESOURCE_URL = "https://blogfactory.io/mcp";
process.env.WORKOS_API_KEY = "sk_test_not_a_real_secret";
const response = handleMcpProtectedResourceMetadata();
assert.equal(response.status, 200);
assert.equal(response.headers.get("cache-control"), "public, max-age=300");
assert.equal(response.headers.get("access-control-allow-origin"), "*");
assert.deepEqual(await response.json(), mcpProtectedResourceMetadata(config!));
if (previousIssuer === undefined) delete process.env.WORKOS_AUTHKIT_ISSUER;
else process.env.WORKOS_AUTHKIT_ISSUER = previousIssuer;
if (previousResource === undefined) delete process.env.MCP_RESOURCE_URL;
else process.env.MCP_RESOURCE_URL = previousResource;
if (previousApiKey === undefined) delete process.env.WORKOS_API_KEY;
else process.env.WORKOS_API_KEY = previousApiKey;

console.log("MCP OAuth resource-server self-check passed");
