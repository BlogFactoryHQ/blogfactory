import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../db/index.js";
import { mcpOAuthConnections, sites } from "../db/schema.js";
import { ApiError } from "../http/error-contract.js";
import type { McpOAuthIdentity } from "../mcp/oauth.js";
import { MCP_SCOPES } from "../mcp/contracts.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function authorizeMcpOAuthConnection(identity: McpOAuthIdentity, usedAt: Date) {
  await db
    .insert(mcpOAuthConnections)
    .values({
      userId: identity.userId,
      siteId: identity.siteId,
      providerConnectionId: identity.connectionId,
      scopes: [...MCP_SCOPES],
    })
    .onConflictDoNothing({ target: mcpOAuthConnections.providerConnectionId });

  const [row] = await db
    .update(mcpOAuthConnections)
    .set({ lastUsedAt: usedAt, scopes: [...MCP_SCOPES] })
    .where(and(
      eq(mcpOAuthConnections.providerConnectionId, identity.connectionId),
      eq(mcpOAuthConnections.userId, identity.userId),
      eq(mcpOAuthConnections.siteId, identity.siteId),
      isNull(mcpOAuthConnections.revokedAt),
    ))
    .returning({ id: mcpOAuthConnections.id, scopes: mcpOAuthConnections.scopes });
  return row;
}

export async function listMcpOAuthConnections(userId: string) {
  const rows = await db
    .select({
      id: mcpOAuthConnections.id,
      siteId: mcpOAuthConnections.siteId,
      siteName: sites.name,
      siteDomain: sites.domain,
      scopes: mcpOAuthConnections.scopes,
      lastUsedAt: mcpOAuthConnections.lastUsedAt,
      revokedAt: mcpOAuthConnections.revokedAt,
      createdAt: mcpOAuthConnections.createdAt,
    })
    .from(mcpOAuthConnections)
    .innerJoin(sites, and(
      eq(sites.id, mcpOAuthConnections.siteId),
      eq(sites.userId, mcpOAuthConnections.userId),
    ))
    .where(eq(mcpOAuthConnections.userId, userId))
    .orderBy(desc(mcpOAuthConnections.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: `OAuth client ${row.id.slice(0, 8)}`,
    scopes: row.scopes,
    site_id: row.siteId,
    site_name: row.siteName,
    site_domain: row.siteDomain,
    last_used_at: row.lastUsedAt,
    revoked_at: row.revokedAt,
    created_at: row.createdAt,
  }));
}

export async function revokeMcpOAuthConnection(userId: string, connectionId: string) {
  if (!UUID.test(connectionId)) throw new ApiError(404, "not_found", "OAuth connection was not found");
  const [row] = await db
    .update(mcpOAuthConnections)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(mcpOAuthConnections.id, connectionId),
      eq(mcpOAuthConnections.userId, userId),
    ))
    .returning({ id: mcpOAuthConnections.id });
  if (!row) throw new ApiError(404, "not_found", "OAuth connection was not found");
  return { revoked: true as const };
}
