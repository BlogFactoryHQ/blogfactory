import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { operationEvents } from "../db/schema.js";

export const OPERATION_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const OPERATION_ORIGINS = ["web", "mcp", "system"] as const;
export const OPERATION_STATUSES = ["started", "succeeded", "failed"] as const;

export type OperationOrigin = typeof OPERATION_ORIGINS[number];
export type OperationStatus = typeof OPERATION_STATUSES[number];

type OperationMetadata = Record<string, string | number | boolean | null>;

export function safeOperationMetadata(action: string, input: unknown): OperationMetadata {
  const value = input && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : {};
  const metadata: OperationMetadata = {};
  for (const key of ["status", "kind", "severity", "source_type", "variations", "page", "limit", "post_type"]) {
    const item = value[key];
    if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") metadata[key] = item;
  }
  if (action === "generate_draft" && typeof value.source_value === "string") {
    metadata.source_length = value.source_value.length;
  }
  return metadata;
}

export async function startOperationEvent(input: {
  userId: string;
  siteId?: string | null;
  origin: OperationOrigin;
  connectionId?: string | null;
  clientName?: string | null;
  action: string;
  objectType?: string | null;
  objectId?: string | null;
  metadata?: OperationMetadata;
  now?: Date;
}) {
  const now = input.now || new Date();
  const [event] = await db.insert(operationEvents).values({
    userId: input.userId,
    siteId: input.siteId || null,
    origin: input.origin,
    connectionId: input.connectionId || null,
    clientName: input.clientName?.slice(0, 120) || null,
    action: input.action.slice(0, 160),
    objectType: input.objectType?.slice(0, 80) || null,
    objectId: input.objectId || null,
    status: "started",
    metadata: input.metadata || {},
    createdAt: now,
    expiresAt: new Date(now.getTime() + OPERATION_RETENTION_MS),
  }).returning({ id: operationEvents.id });
  return event.id;
}

export async function finishOperationEvent(input: {
  id: string;
  status: Exclude<OperationStatus, "started">;
  durationMs: number;
  siteId?: string | null;
  errorCode?: string | null;
}) {
  await db.update(operationEvents).set({
    status: input.status,
    durationMs: Math.max(0, Math.round(input.durationMs)),
    ...(input.siteId ? { siteId: input.siteId } : {}),
    errorCode: input.errorCode?.slice(0, 120) || null,
  }).where(eq(operationEvents.id, input.id));
}

export async function listOperationEvents(input: {
  userId: string;
  siteId?: string;
  origins?: OperationOrigin[];
  limit?: number;
}) {
  const conditions = [eq(operationEvents.userId, input.userId)];
  if (input.siteId) conditions.push(or(eq(operationEvents.siteId, input.siteId), isNull(operationEvents.siteId))!);
  if (input.origins?.length) conditions.push(inArray(operationEvents.origin, input.origins));
  const rows = await db.select().from(operationEvents)
    .where(and(...conditions))
    .orderBy(desc(operationEvents.createdAt))
    .limit(Math.min(Math.max(input.limit || 20, 1), 100));
  return rows.map((row) => ({
    id: row.id,
    site_id: row.siteId,
    origin: row.origin,
    connection_id: row.connectionId,
    client_name: row.clientName,
    action: row.action,
    object_type: row.objectType,
    object_id: row.objectId,
    status: row.status,
    duration_ms: row.durationMs,
    error_code: row.errorCode,
    metadata: row.metadata,
    created_at: row.createdAt.toISOString(),
  }));
}

export async function purgeExpiredOperationEvents(now = new Date()) {
  const rows = await db.delete(operationEvents)
    .where(lt(operationEvents.expiresAt, now))
    .returning({ id: operationEvents.id });
  return rows.length;
}
