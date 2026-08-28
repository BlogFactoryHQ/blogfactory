import { and, eq, inArray } from "drizzle-orm";
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
type OAuthUserSites = {
  userId: string;
  email: string;
  displayName: string | null;
  role: string;
  approvalStatus: string;
  siteIds: string[];
};
type McpAuthDependencies = {
  find: (tokenHash: string) => Promise<TokenLookup>;
  touch: (tokenId: string, usedAt: Date) => Promise<boolean>;
  verifyOAuth?: (token: string) => Promise<McpOAuthIdentity | null>;
  findOAuthUserSites?: (userId: string, siteIds: string[]) => Promise<OAuthUserSites | undefined>;
  authorizeOAuth?: (identity: McpOAuthIdentity, usedAt: Date, canCreate: boolean) => Promise<{ id: string; scopes: string[] } | undefined>;
};

async function findOAuthUserSites(userId: string, siteIds: string[]) {
  const [user] = await db
    .select({
      userId: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      approvalStatus: users.approvalStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return undefined;
  const allowedSites = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.userId, userId), inArray(sites.id, siteIds)));
  return { ...user, siteIds: allowedSites.map((site) => site.id) };
}

const productionDependencies: McpAuthDependencies = {
  find: findMcpAccessToken,
  touch: markMcpAccessTokenUsed,
  verifyOAuth: verifyMcpOAuthAccessToken,
  findOAuthUserSites,
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
  const oauthUser = await (dependencies.findOAuthUserSites || findOAuthUserSites)(
    oauthIdentity.userId,
    oauthIdentity.siteIds,
  );
  if (!oauthUser?.siteIds.length) return null;
  const user = await bootstrapUserAccess({
    id: oauthUser.userId,
    email: oauthUser.email,
    role: oauthUser.role,
    approvalStatus: oauthUser.approvalStatus,
  });
  if (!isApproved(user.role, user.approvalStatus)) return null;
  const connection = await (dependencies.authorizeOAuth || authorizeMcpOAuthConnection)(
    oauthIdentity,
    now,
    oauthUser.siteIds.length === oauthIdentity.siteIds.length,
  );
  if (!connection) return null;

  return {
    tokenId: connection.id,
    clientName: `OAuth client ${connection.id.slice(0, 8)}`,
    userId: oauthUser.userId,
    scopes: new Set(connection.scopes as McpScope[]),
    siteIds: new Set(oauthUser.siteIds),
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
