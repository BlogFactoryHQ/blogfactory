import { and, eq } from "drizzle-orm";
import { MCP_SCOPES, type McpScope } from "./contracts.js";
import { db } from "../db/index.js";
import { sites, users } from "../db/schema.js";
import {
  findMcpAccessToken,
  hashMcpAccessToken,
  isMcpAccessTokenSecret,
  markMcpAccessTokenUsed,
} from "../services/mcp-access-tokens.js";
import { bootstrapUserAccess, isApproved } from "../services/access-control.js";
import {
  type McpOAuthIdentity,
  verifyMcpOAuthAccessToken,
} from "./oauth.js";
import { authorizeMcpOAuthConnection } from "../services/mcp-oauth-connections.js";

export interface McpPrincipal {
  tokenId: string;
  clientName: string;
  userId: string;
  scopes: ReadonlySet<McpScope>;
  siteIds: ReadonlySet<string>;
  displayName: string | null;
  role: string;
  approvalStatus: string;
}

type TokenLookup = Awaited<ReturnType<typeof findMcpAccessToken>>;
type OAuthUserSite = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  approvalStatus: string;
  siteId: string;
};
type McpAuthDependencies = {
  find: (tokenHash: string) => Promise<TokenLookup>;
  touch: (tokenId: string, usedAt: Date) => Promise<boolean>;
  verifyOAuth?: (token: string) => Promise<McpOAuthIdentity | null>;
  findOAuthUserSite?: (userId: string, siteId: string) => Promise<OAuthUserSite | undefined>;
  authorizeOAuth?: (identity: McpOAuthIdentity, usedAt: Date) => Promise<{ id: string; scopes: string[] } | undefined>;
};

async function findOAuthUserSite(userId: string, siteId: string) {
  const [row] = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      approvalStatus: users.approvalStatus,
      siteId: sites.id,
    })
    .from(users)
    .innerJoin(sites, and(eq(sites.id, siteId), eq(sites.userId, users.id)))
    .where(eq(users.id, userId))
    .limit(1);
  return row;
}

const productionDependencies: McpAuthDependencies = {
  find: findMcpAccessToken,
  touch: markMcpAccessTokenUsed,
  verifyOAuth: verifyMcpOAuthAccessToken,
  findOAuthUserSite,
  authorizeOAuth: authorizeMcpOAuthConnection,
};

export async function authenticateMcpBearer(
  authorization: string | undefined,
  dependencies = productionDependencies,
  now = new Date(),
): Promise<McpPrincipal | null> {
  const match = authorization?.match(/^Bearer (.+)$/i);
  const secret = match?.[1];
  if (!secret) return null;

  if (secret.startsWith("bf_mcp_")) {
    if (!isMcpAccessTokenSecret(secret)) return null;
    const token = await dependencies.find(hashMcpAccessToken(secret));
    if (!token || token.revokedAt || (token.expiresAt && token.expiresAt <= now)) return null;
    if (token.scopes.some((scope) => !MCP_SCOPES.includes(scope as McpScope))) return null;

    const user = await bootstrapUserAccess({
      id: token.userId,
      email: token.email,
      role: token.role,
      approvalStatus: token.approvalStatus,
    });
    if (!isApproved(user.role, user.approvalStatus)) return null;

    if (!await dependencies.touch(token.tokenId, now)) return null;
    return {
      tokenId: token.tokenId,
      clientName: token.tokenName,
      userId: token.userId,
      scopes: new Set(token.scopes as McpScope[]),
      siteIds: new Set(token.siteIds),
      displayName: token.displayName,
      role: user.role,
      approvalStatus: user.approvalStatus,
    };
  }

  const oauthIdentity = await (dependencies.verifyOAuth || verifyMcpOAuthAccessToken)(secret);
  if (!oauthIdentity) return null;
  const oauthUser = await (dependencies.findOAuthUserSite || findOAuthUserSite)(
    oauthIdentity.userId,
    oauthIdentity.siteId,
  );
  if (!oauthUser) return null;
  const user = await bootstrapUserAccess({
    id: oauthUser.userId,
    email: oauthUser.email,
    role: oauthUser.role,
    approvalStatus: oauthUser.approvalStatus,
  });
  if (!isApproved(user.role, user.approvalStatus)) return null;
  const connection = await (dependencies.authorizeOAuth || authorizeMcpOAuthConnection)(oauthIdentity, now);
  if (!connection) return null;

  return {
    tokenId: connection.id,
    clientName: `OAuth client ${connection.id.slice(0, 8)}`,
    userId: oauthUser.userId,
    scopes: new Set(connection.scopes as McpScope[]),
    siteIds: new Set([oauthUser.siteId]),
    displayName: oauthUser.displayName,
    role: user.role,
    approvalStatus: user.approvalStatus,
  };
}

export function hasMcpScope(principal: McpPrincipal, scope: McpScope) {
  return principal.scopes.has(scope);
}

export function allowedMcpOrigin(
  request: Request,
  configured = process.env.MCP_ALLOWED_ORIGINS,
  selfHosted = process.env.BLOGFACTORY_SELF_HOSTED === "true",
) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const allowed = new Set([
    ...(!selfHosted ? ["https://blogfactory.io"] : []),
    ...(configured || "").split(",").map((value) => value.trim()).filter(Boolean),
  ]);
  return allowed.has(origin);
}
