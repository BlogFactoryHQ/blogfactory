import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, inArray, isNull, or } from "drizzle-orm";
import { ApiError } from "../http/error-contract.js";
import { MCP_SCOPES, type McpScope } from "../mcp/contracts.js";
import { db } from "../db/index.js";
import { mcpAccessTokens, sites, users } from "../db/schema.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN_PREFIX = "bf_mcp_";
const TOKEN_SECRET_LENGTH = 43;

export type CreateMcpTokenInput = {
  name: string;
  scopes: McpScope[];
  siteIds: string[];
  expiresAt: Date | null;
};

function personalTokenScopes(value: unknown): McpScope[] {
  if (!Array.isArray(value) || !value.includes("content:read") || value.some((scope) => !MCP_SCOPES.includes(scope as McpScope))) {
    throw new ApiError(400, "validation_error", "personal tokens require content:read and only support MCP scopes", [{
      field: "scopes",
      message: `Expected content:read and optionally: ${MCP_SCOPES.slice(1).join(", ")}`,
    }]);
  }
  return MCP_SCOPES.filter((scope) => value.includes(scope));
}

export function hashMcpAccessToken(secret: string) {
  return createHash("sha256").update(secret).digest("hex");
}

export function generateMcpAccessToken() {
  const secret = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return {
    secret,
    prefix: secret.slice(0, TOKEN_PREFIX.length + 8),
    hash: hashMcpAccessToken(secret),
  };
}

export function parseCreateMcpTokenInput(body: Record<string, unknown>, now = new Date()): CreateMcpTokenInput {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) {
    throw new ApiError(400, "validation_error", "name must contain 1 to 100 characters", [{ field: "name", message: "Expected 1 to 100 characters" }]);
  }

  const scopes = personalTokenScopes(body.scopes);

  if (!Array.isArray(body.site_ids) || !body.site_ids.length || body.site_ids.some((id) => typeof id !== "string" || !UUID.test(id))) {
    throw new ApiError(400, "validation_error", "site_ids must contain at least one valid site id", [{ field: "site_ids", message: "Expected a non-empty UUID array" }]);
  }
  const siteIds = [...new Set(body.site_ids as string[])];

  let expiresAt: Date | null = null;
  if (body.expires_at !== null && body.expires_at !== undefined && body.expires_at !== "") {
    if (typeof body.expires_at !== "string") {
      throw new ApiError(400, "validation_error", "expires_at must be an ISO timestamp or null", [{ field: "expires_at", message: "Expected an ISO timestamp or null" }]);
    }
    expiresAt = new Date(body.expires_at);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now) {
      throw new ApiError(400, "validation_error", "expires_at must be a future ISO timestamp", [{ field: "expires_at", message: "Expected a future ISO timestamp" }]);
    }
  }

  return { name, scopes, siteIds, expiresAt };
}

function metadata(row: typeof mcpAccessTokens.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.tokenPrefix,
    scopes: row.scopes,
    site_ids: row.siteIds,
    expires_at: row.expiresAt,
    last_used_at: row.lastUsedAt,
    revoked_at: row.revokedAt,
    created_at: row.createdAt,
  };
}

export async function listMcpAccessTokens(userId: string) {
  const rows = await db
    .select()
    .from(mcpAccessTokens)
    .where(eq(mcpAccessTokens.userId, userId))
    .orderBy(desc(mcpAccessTokens.createdAt));
  return rows.map(metadata);
}

export async function createMcpAccessToken(userId: string, input: CreateMcpTokenInput) {
  const scopes = personalTokenScopes(input.scopes);
  const ownedSites = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.userId, userId), inArray(sites.id, input.siteIds)));
  if (ownedSites.length !== input.siteIds.length) {
    throw new ApiError(404, "not_found", "One or more sites were not found");
  }

  const token = generateMcpAccessToken();
  const [row] = await db
    .insert(mcpAccessTokens)
    .values({
      userId,
      name: input.name,
      tokenPrefix: token.prefix,
      tokenHash: token.hash,
      scopes,
      siteIds: input.siteIds,
      expiresAt: input.expiresAt,
    })
    .returning();
  return { token: metadata(row), secret: token.secret };
}

export async function revokeMcpAccessToken(userId: string, tokenId: string) {
  if (!UUID.test(tokenId)) throw new ApiError(404, "not_found", "MCP token was not found");
  const [row] = await db
    .update(mcpAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpAccessTokens.id, tokenId), eq(mcpAccessTokens.userId, userId)))
    .returning({ id: mcpAccessTokens.id });
  if (!row) throw new ApiError(404, "not_found", "MCP token was not found");
  return { revoked: true as const };
}

export async function findMcpAccessToken(tokenHash: string) {
  const [row] = await db
    .select({
      tokenId: mcpAccessTokens.id,
      tokenName: mcpAccessTokens.name,
      userId: mcpAccessTokens.userId,
      tokenHash: mcpAccessTokens.tokenHash,
      scopes: mcpAccessTokens.scopes,
      siteIds: mcpAccessTokens.siteIds,
      expiresAt: mcpAccessTokens.expiresAt,
      revokedAt: mcpAccessTokens.revokedAt,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      approvalStatus: users.approvalStatus,
    })
    .from(mcpAccessTokens)
    .innerJoin(users, eq(users.id, mcpAccessTokens.userId))
    .where(eq(mcpAccessTokens.tokenHash, tokenHash))
    .limit(1);
  return row;
}

export async function markMcpAccessTokenUsed(tokenId: string, usedAt: Date) {
  const [row] = await db
    .update(mcpAccessTokens)
    .set({ lastUsedAt: usedAt })
    .where(and(
      eq(mcpAccessTokens.id, tokenId),
      isNull(mcpAccessTokens.revokedAt),
      or(isNull(mcpAccessTokens.expiresAt), gt(mcpAccessTokens.expiresAt, usedAt)),
    ))
    .returning({ id: mcpAccessTokens.id });
  return Boolean(row);
}

export function isMcpAccessTokenSecret(value: string) {
  return new RegExp(`^${TOKEN_PREFIX}[A-Za-z0-9_-]{${TOKEN_SECRET_LENGTH}}$`).test(value);
}
