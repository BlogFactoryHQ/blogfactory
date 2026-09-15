import { and, asc, eq, gt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { aiCreditAccounts, aiCreditGrants, aiCreditLedger, aiCreditReservations } from "../db/schema.js";
import { ApiError } from "../http/error-contract.js";

type Allocation = Array<{ grantId: string; credits: number }>;

export async function reserveAiCredits(userId: string, operationKey: string, credits: number) {
  if (!Number.isInteger(credits) || credits <= 0) throw new Error("credits must be a positive integer");
  return db.transaction(async (tx) => {
    const existing = await tx.query.aiCreditReservations.findFirst({ where: eq(aiCreditReservations.operationKey, operationKey) });
    if (existing) return existing;
    await tx.insert(aiCreditAccounts).values({ userId }).onConflictDoNothing();
    const accounts = await tx.execute(sql<{ available_credits: number; debt_credits: number }>`SELECT available_credits, debt_credits FROM ai_credit_accounts WHERE user_id = ${userId} FOR UPDATE`);
    const account = accounts[0];
    if (Number(account.debt_credits) > 0 || Number(account.available_credits) < credits) {
      throw new ApiError(402, "managed_ai_credits_required", "Managed AI credits are required");
    }
    const grants = await tx.select().from(aiCreditGrants).where(and(
      eq(aiCreditGrants.userId, userId), eq(aiCreditGrants.status, "active"), gt(aiCreditGrants.remainingCredits, 0), sql`${aiCreditGrants.expiresAt} > NOW()`,
    )).orderBy(asc(aiCreditGrants.expiresAt));
    let needed = credits;
    const allocation: Allocation = [];
    for (const grant of grants) {
      if (!needed) break;
      const take = Math.min(needed, grant.remainingCredits);
      await tx.update(aiCreditGrants).set({ remainingCredits: sql`${aiCreditGrants.remainingCredits} - ${take}`, updatedAt: new Date() }).where(eq(aiCreditGrants.id, grant.id));
      allocation.push({ grantId: grant.id, credits: take });
      needed -= take;
    }
    if (needed) throw new ApiError(402, "managed_ai_credits_required", "Managed AI credits are required");
    const [reservation] = await tx.insert(aiCreditReservations).values({ userId, operationKey, reservedCredits: credits, allocation }).returning();
    await tx.update(aiCreditAccounts).set({
      availableCredits: sql`${aiCreditAccounts.availableCredits} - ${credits}`,
      reservedCredits: sql`${aiCreditAccounts.reservedCredits} + ${credits}`, updatedAt: new Date(),
    }).where(eq(aiCreditAccounts.userId, userId));
    await tx.insert(aiCreditLedger).values({ userId, entryType: "reservation", credits: -credits, idempotencyKey: `${operationKey}:reserve`, referenceType: "reservation", referenceId: reservation.id });
    return reservation;
  });
}

function returnedAllocation(allocation: Allocation, actual: number) {
  let consumed = actual;
  return allocation.flatMap((item) => {
    const used = Math.min(consumed, item.credits);
    consumed -= used;
    const returned = item.credits - used;
    return returned ? [{ grantId: item.grantId, credits: returned }] : [];
  });
}

export async function settleAiCredits(reservationId: string, actualCredits: number, providerGenerationId?: string | null) {
  if (!Number.isInteger(actualCredits) || actualCredits < 0) throw new Error("actualCredits must be a non-negative integer");
  await db.transaction(async (tx) => {
    const [candidate] = await tx.select({ userId: aiCreditReservations.userId }).from(aiCreditReservations).where(eq(aiCreditReservations.id, reservationId)).limit(1);
    if (!candidate) return;
    await tx.execute(sql`SELECT 1 FROM ai_credit_accounts WHERE user_id = ${candidate.userId} FOR UPDATE`);
    const rows = await tx.execute(sql`SELECT * FROM ai_credit_reservations WHERE id = ${reservationId} FOR UPDATE`);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row || !["reserved", "reconcile"].includes(String(row.state))) return;
    const reserved = Number(row.reserved_credits);
    const userId = String(row.user_id);
    const operationKey = String(row.operation_key);
    const allocation = row.allocation as Allocation;
    const returned = returnedAllocation(allocation, Math.min(actualCredits, reserved));
    for (const item of returned) await tx.update(aiCreditGrants).set({ remainingCredits: sql`${aiCreditGrants.remainingCredits} + ${item.credits}`, updatedAt: new Date() }).where(eq(aiCreditGrants.id, item.grantId));
    const release = Math.max(0, reserved - actualCredits);
    const overage = Math.max(0, actualCredits - reserved);
    await tx.update(aiCreditAccounts).set({
      availableCredits: sql`${aiCreditAccounts.availableCredits} + ${release}`,
      reservedCredits: sql`${aiCreditAccounts.reservedCredits} - ${reserved}`,
      debtCredits: sql`${aiCreditAccounts.debtCredits} + ${overage}`, updatedAt: new Date(),
    }).where(eq(aiCreditAccounts.userId, userId));
    await tx.update(aiCreditReservations).set({ state: "settled", settledCredits: actualCredits, providerGenerationId: providerGenerationId || null, updatedAt: new Date() }).where(eq(aiCreditReservations.id, reservationId));
    await tx.insert(aiCreditLedger).values({ userId, entryType: "usage", credits: -actualCredits, idempotencyKey: `${operationKey}:usage`, referenceType: "reservation", referenceId: reservationId });
    if (release) await tx.insert(aiCreditLedger).values({ userId, entryType: "release", credits: release, idempotencyKey: `${operationKey}:release`, referenceType: "reservation", referenceId: reservationId });
  });
}

export async function releaseAiCredits(reservationId: string) {
  await db.transaction(async (tx) => {
    const [candidate] = await tx.select({ userId: aiCreditReservations.userId }).from(aiCreditReservations).where(eq(aiCreditReservations.id, reservationId)).limit(1);
    if (!candidate) return;
    await tx.execute(sql`SELECT 1 FROM ai_credit_accounts WHERE user_id = ${candidate.userId} FOR UPDATE`);
    const rows = await tx.execute(sql`SELECT * FROM ai_credit_reservations WHERE id = ${reservationId} FOR UPDATE`);
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row || row.state !== "reserved") return;
    const allocation = row.allocation as Allocation;
    for (const item of allocation) await tx.update(aiCreditGrants).set({ remainingCredits: sql`${aiCreditGrants.remainingCredits} + ${item.credits}`, updatedAt: new Date() }).where(eq(aiCreditGrants.id, item.grantId));
    const reserved = Number(row.reserved_credits);
    const userId = String(row.user_id);
    await tx.update(aiCreditAccounts).set({ availableCredits: sql`${aiCreditAccounts.availableCredits} + ${reserved}`, reservedCredits: sql`${aiCreditAccounts.reservedCredits} - ${reserved}`, updatedAt: new Date() }).where(eq(aiCreditAccounts.userId, userId));
    await tx.update(aiCreditReservations).set({ state: "released", updatedAt: new Date() }).where(eq(aiCreditReservations.id, reservationId));
    await tx.insert(aiCreditLedger).values({ userId, entryType: "release", credits: reserved, idempotencyKey: `${String(row.operation_key)}:release`, referenceType: "reservation", referenceId: reservationId }).onConflictDoNothing();
  });
}

export async function markAiCreditsForReconciliation(reservationId: string, providerGenerationId?: string | null) {
  await db.update(aiCreditReservations).set({ state: "reconcile", providerGenerationId: providerGenerationId || null, updatedAt: new Date() })
    .where(and(eq(aiCreditReservations.id, reservationId), eq(aiCreditReservations.state, "reserved")));
}

export async function purgeStaleAiCreditReservations(maxAgeMinutes = 30) {
  const rows = await db.select({ id: aiCreditReservations.id }).from(aiCreditReservations)
    .where(and(eq(aiCreditReservations.state, "reserved"), sql`${aiCreditReservations.updatedAt} < NOW() - (${maxAgeMinutes} * INTERVAL '1 minute')`));
  for (const row of rows) await releaseAiCredits(row.id);
  return rows.length;
}

export async function expireAiCredits() {
  const notAllocated = sql`NOT EXISTS (
    SELECT 1 FROM ai_credit_reservations reservation,
      jsonb_array_elements(reservation.allocation) allocation
    WHERE reservation.state IN ('reserved', 'reconcile')
      AND allocation->>'grantId' = ${aiCreditGrants.id}::text
  )`;
  const grants = await db.select().from(aiCreditGrants).where(and(eq(aiCreditGrants.status, "active"), sql`${aiCreditGrants.expiresAt} <= NOW()`, notAllocated));
  for (const grant of grants) await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT 1 FROM ai_credit_accounts WHERE user_id = ${grant.userId} FOR UPDATE`);
    const remaining = grant.remainingCredits;
    const [expired] = await tx.update(aiCreditGrants).set({ status: "expired", remainingCredits: 0, updatedAt: new Date() })
      .where(and(eq(aiCreditGrants.id, grant.id), eq(aiCreditGrants.status, "active"), notAllocated)).returning();
    if (!expired) return;
    await tx.update(aiCreditAccounts).set({ availableCredits: sql`GREATEST(0, ${aiCreditAccounts.availableCredits} - ${remaining})`, updatedAt: new Date() }).where(eq(aiCreditAccounts.userId, expired.userId));
    await tx.insert(aiCreditLedger).values({ userId: expired.userId, entryType: "expiry", credits: -remaining, idempotencyKey: `grant:${expired.id}:expiry`, referenceType: "grant", referenceId: expired.id });
  });
  return grants.length;
}

export const aiCreditMath = { returnedAllocation };
