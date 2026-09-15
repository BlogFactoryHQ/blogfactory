import { and, count, eq, sql, sum } from "drizzle-orm";
import { db, type Database } from "../db/index.js";
import { feeds, imageAssets, jobs, sites } from "../db/schema.js";
import { ApiError } from "../http/error-contract.js";
import { cloudEnforcementEnabled, getCloudAccess } from "./cloud-entitlements.js";

export type CloudLimitExecutor = Pick<Database, "select" | "execute" | "insert" | "update">;

export async function withCloudLimitLock<T>(userId: string, task: (executor: CloudLimitExecutor) => Promise<T>) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`cloud-limit:${userId}`}))`);
    return task(tx);
  });
}

async function limitFor(userId: string, key: "sites" | "activeFeeds" | "storageBytes" | "concurrency") {
  if (!cloudEnforcementEnabled()) return null;
  const access = await getCloudAccess(userId);
  if (!access.allowed) throw new ApiError(403, "forbidden", "An active Cloud plan is required");
  return access.limits[key];
}

export async function assertCanCreateSite(userId: string, executor: CloudLimitExecutor = db) {
  const limit = await limitFor(userId, "sites");
  if (limit === null) return;
  const [row] = await executor.select({ value: count() }).from(sites).where(eq(sites.userId, userId));
  if (Number(row.value) >= limit) throw new ApiError(429, "plan_quota_reached", "Site limit reached for this plan");
}

export async function assertCanActivateFeed(userId: string, excludeId?: string, executor: CloudLimitExecutor = db) {
  const limit = await limitFor(userId, "activeFeeds");
  if (limit === null) return;
  const where = excludeId ? and(eq(feeds.userId, userId), eq(feeds.isActive, true), sql`${feeds.id} <> ${excludeId}`) : and(eq(feeds.userId, userId), eq(feeds.isActive, true));
  const [row] = await executor.select({ value: count() }).from(feeds).where(where);
  if (Number(row.value) >= limit) throw new ApiError(429, "plan_quota_reached", "Active RSS limit reached for this plan");
}

export async function assertStorageAvailable(userId: string, incomingBytes: number, executor: CloudLimitExecutor = db) {
  const limit = await limitFor(userId, "storageBytes");
  if (limit === null) return;
  const [row] = await executor.select({ value: sum(imageAssets.fileSizeBytes) }).from(imageAssets).where(eq(imageAssets.userId, userId));
  if (Number(row.value || 0) + incomingBytes > limit) throw new ApiError(429, "plan_quota_reached", "Storage limit reached for this plan");
}

export async function claimGenerationSlot(userId: string, jobId: string) {
  const limit = await limitFor(userId, "concurrency");
  if (limit === null) {
    await db.update(jobs).set({ status: "running" }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
    return;
  }
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    const [row] = await tx.select({ value: count() }).from(jobs).where(and(eq(jobs.userId, userId), eq(jobs.status, "running"), sql`${jobs.id} <> ${jobId}`));
    if (Number(row.value) >= limit) throw new ApiError(429, "plan_quota_reached", "Concurrent generation limit reached for this plan");
    await tx.update(jobs).set({ status: "running" }).where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)));
  });
}
