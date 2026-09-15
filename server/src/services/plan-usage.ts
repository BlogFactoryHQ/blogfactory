import { and, eq, sql } from "drizzle-orm";
import { db, type Database } from "../db/index.js";
import { planUsageReservations } from "../db/schema.js";
import { ApiError } from "../http/error-contract.js";
import { utcMonthStart } from "./billing-config.js";
import { cloudEnforcementEnabled, getCloudAccess } from "./cloud-entitlements.js";

export type DraftOrigin = "manual" | "automated";
type QuotaExecutor = Pick<Database, "execute" | "query" | "insert" | "update">;

async function reserveWith(executor: QuotaExecutor, userId: string, origin: DraftOrigin, operationKey: string, limit: number, plan: string) {
  const existing = await executor.query.planUsageReservations.findFirst({ where: eq(planUsageReservations.operationKey, operationKey) });
  if (existing) return existing.id;
  const periodStart = utcMonthStart();
  await executor.execute(sql`INSERT INTO plan_usage_monthly (user_id, period_start) VALUES (${userId}, ${periodStart}) ON CONFLICT DO NOTHING`);
  const rows = await executor.execute(sql<{ manual_completed: number; manual_reserved: number; automated_completed: number; automated_reserved: number }>`
    SELECT manual_completed, manual_reserved, automated_completed, automated_reserved
    FROM plan_usage_monthly WHERE user_id = ${userId} AND period_start = ${periodStart} FOR UPDATE`);
  const usage = rows[0];
  const used = plan === "cloud"
    ? Number(usage.manual_completed) + Number(usage.manual_reserved) + Number(usage.automated_completed) + Number(usage.automated_reserved)
    : Number(usage.automated_completed) + Number(usage.automated_reserved);
  if (used >= limit) throw new ApiError(429, "plan_quota_reached", "Monthly draft quota reached");
  const [reservation] = await executor.insert(planUsageReservations).values({ userId, operationKey, periodStart, origin, amount: 1 }).returning({ id: planUsageReservations.id });
  const column = origin === "manual" ? sql.raw("manual_reserved") : sql.raw("automated_reserved");
  await executor.execute(sql`UPDATE plan_usage_monthly SET ${column} = ${column} + 1, updated_at = NOW() WHERE user_id = ${userId} AND period_start = ${periodStart}`);
  return reservation.id;
}

async function settleWith(executor: QuotaExecutor, reservationId: string, completed: boolean) {
  const [reservation] = await executor.update(planUsageReservations).set({ state: completed ? "settled" : "released", updatedAt: new Date() })
    .where(and(eq(planUsageReservations.id, reservationId), eq(planUsageReservations.state, "reserved"))).returning();
  if (!reservation) return;
  const reserved = reservation.origin === "manual" ? sql.raw("manual_reserved") : sql.raw("automated_reserved");
  const done = reservation.origin === "manual" ? sql.raw("manual_completed") : sql.raw("automated_completed");
  await executor.execute(completed
    ? sql`UPDATE plan_usage_monthly SET ${reserved} = ${reserved} - 1, ${done} = ${done} + 1, updated_at = NOW() WHERE user_id = ${reservation.userId} AND period_start = ${reservation.periodStart}`
    : sql`UPDATE plan_usage_monthly SET ${reserved} = ${reserved} - 1, updated_at = NOW() WHERE user_id = ${reservation.userId} AND period_start = ${reservation.periodStart}`);
}

export async function reserveDraftQuota(userId: string, origin: DraftOrigin, operationKey: string) {
  if (!cloudEnforcementEnabled()) return null;
  const access = await getCloudAccess(userId);
  if (!access.allowed) throw new ApiError(403, "forbidden", "An active Cloud plan is required");
  const limit = access.plan === "cloud" ? access.limits.monthlyDrafts : origin === "automated" ? access.limits.monthlyAutomatedDrafts : null;
  if (limit === null) return null;
  return db.transaction((tx) => reserveWith(tx, userId, origin, operationKey, limit, access.plan));
}

export async function settleDraftQuota(reservationId: string | null, completed: boolean) {
  if (!reservationId) return;
  await db.transaction((tx) => settleWith(tx, reservationId, completed));
}

export async function withDraftQuota<T>(userId: string, origin: DraftOrigin, operationKey: string, create: (executor: QuotaExecutor) => Promise<T>) {
  if (!cloudEnforcementEnabled()) return create(db);
  const access = await getCloudAccess(userId);
  if (!access.allowed) throw new ApiError(403, "forbidden", "An active Cloud plan is required");
  const limit = access.plan === "cloud" ? access.limits.monthlyDrafts : origin === "automated" ? access.limits.monthlyAutomatedDrafts : null;
  if (limit === null) return create(db);
  return db.transaction(async (tx) => {
    const reservation = await reserveWith(tx, userId, origin, operationKey, limit, access.plan);
    const result = await create(tx);
    await settleWith(tx, reservation, true);
    return result;
  });
}

export async function purgeStalePlanReservations(maxAgeMinutes = 30) {
  const stale = await db.select({ id: planUsageReservations.id }).from(planUsageReservations)
    .where(and(eq(planUsageReservations.state, "reserved"), sql`${planUsageReservations.createdAt} < NOW() - (${maxAgeMinutes} * INTERVAL '1 minute')`));
  for (const row of stale) await settleDraftQuota(row.id, false);
  return stale.length;
}
