import {
  createRemoteJWKSet,
  errors,
  jwtVerify,
  type JWTVerifyGetKey,
  type JWTPayload,
} from "jose";

export const MCP_OAUTH_USER_ID_CLAIM = "urn:blogfactory:user_id";
export const MCP_OAUTH_SITE_ID_CLAIM = "urn:blogfactory:site_id";
export const MCP_OAUTH_READ_SCOPE = "content:read";
// AuthKit issues these standard OAuth scopes. BlogFactory authorizes its
// draft-only capabilities from the site-bound consent claims after token verification.
export const MCP_OAUTH_SCOPES = ["openid", "profile", "email", "offline_access"];

export interface McpOAuthConfig {
  issuer: string;
  resource: string;
  jwksUrl: string;
  protectedResourceMetadataUrl: string;
}

export interface McpOAuthIdentity {
  connectionId: string;
  userId: string;
  siteId: string;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVALID_TOKEN_ERROR_CODES = new Set([
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWT_EXPIRED",
  "ERR_JWT_INVALID",
  "ERR_JWKS_NO_MATCHING_KEY",
]);
const jwksByIssuer = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function canonicalUrl(value: string, label: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, a query, or a fragment`);
  }
  return url;
}

export function getMcpOAuthConfig(
  env: Record<string, string | undefined> = process.env,
): McpOAuthConfig | null {
  const issuerValue = env.WORKOS_AUTHKIT_ISSUER?.trim();
  const resourceValue = env.MCP_RESOURCE_URL?.trim();
  const apiKey = env.WORKOS_API_KEY?.trim();
  if (!issuerValue && !resourceValue && !apiKey) return null;
  if (!issuerValue || !resourceValue || !apiKey) {
    throw new Error("MCP OAuth requires WORKOS_AUTHKIT_ISSUER, MCP_RESOURCE_URL, and WORKOS_API_KEY");
  }

  const issuerUrl = canonicalUrl(issuerValue, "WORKOS_AUTHKIT_ISSUER");
  const resourceUrl = canonicalUrl(resourceValue, "MCP_RESOURCE_URL");
  if (issuerUrl.protocol !== "https:" || issuerUrl.pathname !== "/") {
    throw new Error("WORKOS_AUTHKIT_ISSUER must be an HTTPS origin");
  }
  const loopbackResource = resourceUrl.protocol === "http:"
    && (resourceUrl.hostname === "localhost" || resourceUrl.hostname === "127.0.0.1");
  if ((resourceUrl.protocol !== "https:" && !loopbackResource) || resourceUrl.pathname !== "/mcp") {
    throw new Error("MCP_RESOURCE_URL must be an HTTPS /mcp URL, or HTTP on loopback");
  }

  const issuer = issuerUrl.origin;
  const resource = resourceUrl.toString();
  return {
    issuer,
    resource,
    jwksUrl: `${issuer}/oauth2/jwks`,
    protectedResourceMetadataUrl: `${resourceUrl.origin}/.well-known/oauth-protected-resource`,
  };
}

export function mcpProtectedResourceMetadata(config: McpOAuthConfig) {
  return {
    resource: config.resource,
    authorization_servers: [config.issuer],
    scopes_supported: MCP_OAUTH_SCOPES,
    bearer_methods_supported: ["header"],
  };
}

export function mcpBearerChallenge(config = getMcpOAuthConfig()) {
  if (!config) return "Bearer";
  return `Bearer resource_metadata="${config.protectedResourceMetadataUrl}", scope="${MCP_OAUTH_SCOPES.join(" ")}"`;
}

export function mcpOAuthIdentityFromClaims(payload: JWTPayload): McpOAuthIdentity | null {
  const connectionId = payload.sid;
  const userId = payload[MCP_OAUTH_USER_ID_CLAIM];
  const siteId = payload[MCP_OAUTH_SITE_ID_CLAIM];
  if (
    typeof connectionId !== "string"
    || connectionId.length === 0
    || connectionId.length > 255
    || typeof userId !== "string"
    || !UUID_PATTERN.test(userId)
    || typeof siteId !== "string"
    || !UUID_PATTERN.test(siteId)
  ) return null;
  return { connectionId, userId, siteId };
}

export function isInvalidMcpOAuthTokenError(error: unknown) {
  return error instanceof errors.JOSEError && INVALID_TOKEN_ERROR_CODES.has(error.code);
}

export async function verifyMcpOAuthAccessToken(
  token: string,
  config = getMcpOAuthConfig(),
  keyResolver?: JWTVerifyGetKey,
): Promise<McpOAuthIdentity | null> {
  if (!config || token.split(".").length !== 3) return null;
  let resolver = keyResolver;
  if (!resolver) {
    let remoteResolver = jwksByIssuer.get(config.issuer);
    if (!remoteResolver) {
      remoteResolver = createRemoteJWKSet(new URL(config.jwksUrl));
      jwksByIssuer.set(config.issuer, remoteResolver);
    }
    resolver = remoteResolver;
  }

  try {
    const { payload } = await jwtVerify(token, resolver, {
      issuer: config.issuer,
      audience: config.resource,
      algorithms: ["RS256"],
    });
    return mcpOAuthIdentityFromClaims(payload);
  } catch (error) {
    if (isInvalidMcpOAuthTokenError(error)) return null;
    throw error;
  }
}

export function handleMcpProtectedResourceMetadata() {
  const config = getMcpOAuthConfig();
  if (!config) {
    return Response.json({ error: "OAuth is not configured" }, {
      status: 404,
      headers: { "access-control-allow-origin": "*" },
    });
  }
  return Response.json(mcpProtectedResourceMetadata(config), {
    headers: {
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
}
