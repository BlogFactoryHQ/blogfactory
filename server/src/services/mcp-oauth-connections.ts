import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { mcpOAuthConnections, sites } from "../db/schema.js";
import { ApiError } from "../http/error-contract.js";
import type { McpOAuthIdentity } from "../mcp/oauth.js";
import { MCP_SCOPES } from "../mcp/contracts.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function authorizeMcpOAuthConnection(identity: McpOAuthIdentity, usedAt: Date, canCreate = true) {
  if (canCreate) {
    await db
      .insert(mcpOAuthConnections)
      .values({
        userId: identity.userId,
        siteId: identity.siteIds[0],
        siteIds: identity.siteIds,
        providerConnectionId: identity.connectionId,
        scopes: [...MCP_SCOPES],
      })
      .onConflictDoNothing({ target: mcpOAuthConnections.providerConnectionId });
  }
  const matchingGrant = identity.siteIds.length === 1
    ? or(
      eq(mcpOAuthConnections.siteIds, identity.siteIds),
      and(isNull(mcpOAuthConnections.siteIds), eq(mcpOAuthConnections.siteId, identity.siteIds[0])),
    )
    : eq(mcpOAuthConnections.siteIds, identity.siteIds);

  const [row] = await db
    .update(mcpOAuthConnections)
    .set({ lastUsedAt: usedAt, scopes: [...MCP_SCOPES] })
    .where(and(
      eq(mcpOAuthConnections.providerConnectionId, identity.connectionId),
      eq(mcpOAuthConnections.userId, identity.userId),
      matchingGrant,
      isNull(mcpOAuthConnections.revokedAt),
    ))
    .returning({ id: mcpOAuthConnections.id, scopes: mcpOAuthConnections.scopes });
  return row;
}

export async function listMcpOAuthConnections(userId: string) {
  const rows = await db
    .select({
      id: mcpOAuthConnections.id,
      siteIds: mcpOAuthConnections.siteIds,
      siteId: mcpOAuthConnections.siteId,
      scopes: mcpOAuthConnections.scopes,
      lastUsedAt: mcpOAuthConnections.lastUsedAt,
      revokedAt: mcpOAuthConnections.revokedAt,
      createdAt: mcpOAuthConnections.createdAt,
    })
    .from(mcpOAuthConnections)
    .where(eq(mcpOAuthConnections.userId, userId))
    .orderBy(desc(mcpOAuthConnections.createdAt));
  const normalizedRows = rows.map((row) => ({
    ...row,
    siteIds: row.siteIds || (row.siteId ? [row.siteId] : []),
  }));
  const siteIds = [...new Set(normalizedRows.flatMap((row) => row.siteIds))];
  const siteRows = siteIds.length ? await db
    .select({ id: sites.id, name: sites.name, domain: sites.domain })
    .from(sites)
    .where(and(eq(sites.userId, userId), inArray(sites.id, siteIds))) : [];
  const siteById = new Map(siteRows.map((site) => [site.id, site]));
  return normalizedRows.map((row) => ({
    id: row.id,
    name: `OAuth client ${row.id.slice(0, 8)}`,
    scopes: row.scopes,
    site_ids: row.siteIds,
    sites: row.siteIds.flatMap((siteId) => {
      const site = siteById.get(siteId);
      return site ? [site] : [];
    }),
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
