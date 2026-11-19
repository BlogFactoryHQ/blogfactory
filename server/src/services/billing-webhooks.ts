import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  aiCreditAccounts,
  aiCreditGrants,
  aiCreditLedger,
  billingCustomers,
  billingEntitlements,
  billingSubscriptions,
  billingWebhookEvents,
} from "../db/schema.js";
import { AI_CREDIT_PACK, PLAN_LIMITS, planForSku, skuForProductId } from "./billing-config.js";
import { getPolarClient } from "./polar-client.js";

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown): JsonRecord => value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
const text = (value: unknown) => typeof value === "string" && value ? value : null;
const date = (value: unknown, fallback = new Date()) => value instanceof Date ? value : typeof value === "string" && !Number.isNaN(Date.parse(value)) ? new Date(value) : fallback;

export function creditRefundReversal(refundedCents: number, alreadyReversed: number, remaining: number) {
  const desired = Math.min(AI_CREDIT_PACK.credits, Math.floor(AI_CREDIT_PACK.credits * refundedCents / AI_CREDIT_PACK.priceCents));
  const reversal = Math.max(0, desired - alreadyReversed);
  const unused = Math.min(remaining, reversal);
  return { desired, reversal, unused, debt: reversal - unused };
}

export type NormalizedPolarEvent = {
  type: string;
  timestamp: string;
  userId: string | null;
  customerId: string | null;
  objectId: string | null;
  productId: string | null;
  subscriptionId: string | null;
  status: string | null;
  modifiedAt: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  amountCents: number | null;
  dispute: boolean;
};

export function normalizePolarEvent(payload: unknown): NormalizedPolarEvent {
  const root = asRecord(payload);
  const data = asRecord(root.data);
  const customer = asRecord(data.customer);
  const timestamp = date(root.timestamp);
  return {
    type: text(root.type) || "unknown",
    timestamp: timestamp.toISOString(),
    userId: text(customer.externalId) || text(data.externalCustomerId) || text(data.externalId),
    customerId: text(data.customerId) || text(customer.id) || (String(root.type || "") === "customer.state_changed" ? text(data.id) : null),
    objectId: text(data.orderId) || text(data.id),
    productId: text(data.productId) || text(asRecord(data.product).id),
    subscriptionId: text(data.subscriptionId) || (String(root.type || "").startsWith("subscription.") ? text(data.id) : null),
    status: text(data.status),
    modifiedAt: date(data.modifiedAt, timestamp).toISOString(),
    currentPeriodStart: data.currentPeriodStart ? date(data.currentPeriodStart).toISOString() : null,
    currentPeriodEnd: data.currentPeriodEnd ? date(data.currentPeriodEnd).toISOString() : null,
    cancelAtPeriodEnd: data.cancelAtPeriodEnd === true,
    amountCents: Number.isInteger(data.refundedAmount) ? Number(data.refundedAmount) : Number.isInteger(data.amount) ? Number(data.amount) : Number.isInteger(data.totalAmount) ? Number(data.totalAmount) : null,
    dispute: Boolean(data.dispute),
  };
}

export async function enqueuePolarWebhook(eventId: string, payload: unknown) {
  const normalized = normalizePolarEvent(payload);
  if (!eventId) throw new Error("Missing Polar webhook id");
  await db.insert(billingWebhookEvents).values({
    eventId,
    eventType: normalized.type,
    providerModifiedAt: new Date(normalized.modifiedAt),
    payload: normalized,
  }).onConflictDoNothing();
}

async function grantTopUp(event: NormalizedPolarEvent) {
  if (!event.userId || !event.objectId) throw new Error("polar_event_missing_customer");
  const expiresAt = new Date(new Date(event.timestamp).getTime() + AI_CREDIT_PACK.validDays * 86_400_000);
  await db.transaction(async (tx) => {
    const inserted = await tx.insert(aiCreditGrants).values({
      userId: event.userId!, source: "purchase", sourceRef: event.objectId!,
      grantedCredits: AI_CREDIT_PACK.credits, remainingCredits: AI_CREDIT_PACK.credits, expiresAt,
    }).onConflictDoNothing().returning({ id: aiCreditGrants.id });
    if (!inserted.length) return;
    await tx.insert(aiCreditAccounts).values({ userId: event.userId!, availableCredits: AI_CREDIT_PACK.credits })
      .onConflictDoUpdate({ target: aiCreditAccounts.userId, set: {
        availableCredits: sql`${aiCreditAccounts.availableCredits} + ${AI_CREDIT_PACK.credits}`,
        updatedAt: new Date(),
      }});
    await tx.insert(aiCreditLedger).values({
      userId: event.userId!, entryType: "purchase", credits: AI_CREDIT_PACK.credits,
      idempotencyKey: `polar-order:${event.objectId}`, referenceType: "order", referenceId: event.objectId,
    });
  });
}

async function upsertSubscription(event: NormalizedPolarEvent) {
  if (!event.userId || !event.customerId || !event.subscriptionId || !event.productId) throw new Error("polar_event_missing_subscription_fields");
  const sku = skuForProductId(event.productId);
  const plan = sku && planForSku(sku);
  if (!plan) throw new Error("polar_unknown_product");
  const providerModifiedAt = new Date(event.modifiedAt);
  const status = event.type === "subscription.revoked" || event.status === "revoked" ? "revoked"
    : event.type === "subscription.past_due" || event.status === "past_due" ? "past_due"
      : event.type === "subscription.canceled" || event.status === "canceled" ? "canceled" : "active";
  await db.transaction(async (tx) => {
    await tx.insert(billingCustomers).values({ userId: event.userId!, polarCustomerId: event.customerId! })
      .onConflictDoUpdate({ target: billingCustomers.userId, set: { polarCustomerId: event.customerId!, updatedAt: new Date() } });
    const changed = await tx.insert(billingSubscriptions).values({
      userId: event.userId!, polarSubscriptionId: event.subscriptionId!, polarProductId: event.productId!, planCode: plan,
      status, currentPeriodStart: event.currentPeriodStart ? new Date(event.currentPeriodStart) : null,
      currentPeriodEnd: event.currentPeriodEnd ? new Date(event.currentPeriodEnd) : null,
      cancelAtPeriodEnd: event.cancelAtPeriodEnd, pastDueAt: status === "past_due" ? new Date(event.timestamp) : null,
      providerModifiedAt,
    }).onConflictDoUpdate({
      target: billingSubscriptions.polarSubscriptionId,
      set: {
        polarProductId: event.productId!, planCode: plan, status,
        currentPeriodStart: event.currentPeriodStart ? new Date(event.currentPeriodStart) : null,
        currentPeriodEnd: event.currentPeriodEnd ? new Date(event.currentPeriodEnd) : null,
        cancelAtPeriodEnd: event.cancelAtPeriodEnd,
        pastDueAt: status === "past_due"
          ? sql`CASE WHEN ${billingSubscriptions.status} = 'past_due' THEN ${billingSubscriptions.pastDueAt} ELSE ${new Date(event.timestamp).toISOString()}::timestamptz END`
          : null,
        providerModifiedAt, updatedAt: new Date(),
      },
      setWhere: sql`${billingSubscriptions.providerModifiedAt} <= ${providerModifiedAt.toISOString()}::timestamptz`,
    }).returning({ id: billingSubscriptions.id });
    if (!changed.length) return;
    await tx.insert(billingEntitlements).values({
      userId: event.userId!, planCode: plan, source: "polar", status,
      effectiveAt: event.currentPeriodStart ? new Date(event.currentPeriodStart) : new Date(event.timestamp),
      expiresAt: event.currentPeriodEnd ? new Date(event.currentPeriodEnd) : null,
      limits: PLAN_LIMITS[plan],
    }).onConflictDoUpdate({ target: billingEntitlements.userId, set: {
      planCode: plan, source: "polar", status,
      effectiveAt: event.currentPeriodStart ? new Date(event.currentPeriodStart) : new Date(event.timestamp),
      expiresAt: event.currentPeriodEnd ? new Date(event.currentPeriodEnd) : null,
      limits: PLAN_LIMITS[plan], version: sql`${billingEntitlements.version} + 1`, updatedAt: new Date(),
    }});
  });
}

async function reverseTopUp(event: NormalizedPolarEvent) {
  if (!event.objectId || event.amountCents === null) throw new Error("polar_refund_missing_order");
  await db.transaction(async (tx) => {
    const [candidate] = await tx.execute(sql<Record<string, unknown>>`SELECT id, user_id FROM ai_credit_grants WHERE source_ref = ${event.objectId}`);
    if (!candidate) return;
    await tx.execute(sql`SELECT 1 FROM ai_credit_accounts WHERE user_id = ${String(candidate.user_id)} FOR UPDATE`);
    const [grant] = await tx.execute(sql<Record<string, unknown>>`SELECT * FROM ai_credit_grants WHERE id = ${String(candidate.id)} FOR UPDATE`);
    if (!grant) return;
    const userId = String(grant.user_id);
    const inFlight = await tx.execute(sql`SELECT 1 FROM ai_credit_reservations WHERE user_id = ${userId} AND state IN ('reserved', 'reconcile') LIMIT 1`);
    if (inFlight.length) throw new Error("credit_reservations_in_flight");
    const previousRows = await tx.execute(sql<{ reversed: number }>`SELECT COALESCE(-SUM(credits), 0)::int AS reversed FROM ai_credit_ledger WHERE reference_type = 'order' AND reference_id = ${event.objectId} AND entry_type IN ('refund_reversal', 'chargeback')`);
    const refund = creditRefundReversal(event.amountCents!, Number(previousRows[0]?.reversed || 0), Number(grant.remaining_credits));
    const { desired: desiredReversal, reversal, unused: unusedReversal, debt } = refund;
    if (!reversal) return;
    const remaining = Number(grant.remaining_credits);
    await tx.update(aiCreditGrants).set({
      remainingCredits: remaining - unusedReversal,
      status: event.dispute ? "charged_back" : desiredReversal >= AI_CREDIT_PACK.credits || remaining === unusedReversal ? "refunded" : "active",
      updatedAt: new Date(),
    }).where(eq(aiCreditGrants.id, String(grant.id)));
    await tx.update(aiCreditAccounts).set({
      availableCredits: sql`GREATEST(0, ${aiCreditAccounts.availableCredits} - ${unusedReversal})`,
      debtCredits: sql`${aiCreditAccounts.debtCredits} + ${debt}`,
      updatedAt: new Date(),
    }).where(eq(aiCreditAccounts.userId, userId));
    await tx.insert(aiCreditLedger).values({
      userId, entryType: event.dispute ? "chargeback" : "refund_reversal", credits: -reversal,
      idempotencyKey: `polar-order:${event.objectId}:${event.dispute ? "chargeback" : "refund"}:${desiredReversal}`,
      referenceType: "order", referenceId: event.objectId,
      metadata: { refunded_cents: event.amountCents, debt_credits: debt },
    }).onConflictDoNothing();
  });
}

async function revokeRefundedPlan(event: NormalizedPolarEvent) {
  const subscription = event.subscriptionId ? await db.query.billingSubscriptions.findFirst({ where: eq(billingSubscriptions.polarSubscriptionId, event.subscriptionId) }) : null;
  const userId = event.userId || subscription?.userId;
  if (!userId) throw new Error("polar_refund_missing_customer");
  await db.update(billingEntitlements).set({ status: "revoked", expiresAt: new Date(event.timestamp), version: sql`${billingEntitlements.version} + 1`, updatedAt: new Date() })
    .where(and(eq(billingEntitlements.userId, userId), eq(billingEntitlements.source, "polar")));
}

async function processEvent(event: NormalizedPolarEvent) {
  const sku = event.productId ? skuForProductId(event.productId) : null;
  if (event.type === "order.paid" && sku === AI_CREDIT_PACK.sku) return grantTopUp(event);
  if (event.type.startsWith("subscription.")) return upsertSubscription(event);
  if (event.type === "customer.state_changed" && event.userId) return reconcilePolarCustomer(event.userId);
  if (event.type === "order.refunded" || event.type.startsWith("refund.")) {
    if (event.type.startsWith("refund.") && event.status !== "succeeded") return;
    if (sku === AI_CREDIT_PACK.sku) return reverseTopUp(event);
    if (sku && planForSku(sku)) return revokeRefundedPlan(event);
    if (event.subscriptionId) return revokeRefundedPlan(event);
    return reverseTopUp(event);
  }
}

export async function reconcilePolarCustomer(userId: string) {
  const state = await getPolarClient().customers.getStateExternal({ externalId: userId });
  for (const subscription of state.activeSubscriptions) {
    await processEvent(normalizePolarEvent({ type: "subscription.updated", timestamp: new Date(), data: { ...subscription, customerId: state.id, customer: { id: state.id, externalId: userId } } }));
  }
  if (!state.activeSubscriptions.length) {
    await db.transaction(async (tx) => {
      await tx.update(billingSubscriptions).set({ status: "revoked", providerModifiedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(billingSubscriptions.userId, userId), sql`${billingSubscriptions.status} IN ('active', 'canceled', 'past_due')`));
      await tx.update(billingEntitlements).set({ status: "revoked", expiresAt: new Date(), version: sql`${billingEntitlements.version} + 1`, updatedAt: new Date() })
        .where(and(eq(billingEntitlements.userId, userId), eq(billingEntitlements.source, "polar")));
    });
  }
  return { subscriptions: state.activeSubscriptions.length };
}

export async function reconcilePolarCustomers(limit = 20) {
  if (!process.env.POLAR_ACCESS_TOKEN) return { processed: 0 };
  const customers = await db.select({ userId: billingCustomers.userId }).from(billingCustomers).orderBy(asc(billingCustomers.updatedAt)).limit(limit);
  let processed = 0;
  for (const customer of customers) {
    try { await reconcilePolarCustomer(customer.userId); processed++; }
    catch { /* webhook remains authoritative; the next drain retries reconciliation */ }
  }
  return { processed };
}

export async function drainPolarWebhookEvents(limit = 20) {
  const staleBefore = new Date(Date.now() - 5 * 60_000);
  await db.update(billingWebhookEvents).set({ status: "pending", processingStartedAt: null, errorCode: "stale_processing_requeued" })
    .where(and(eq(billingWebhookEvents.status, "processing"), lt(billingWebhookEvents.processingStartedAt, staleBefore)));
  const pending = await db.select().from(billingWebhookEvents)
    .where(eq(billingWebhookEvents.status, "pending")).orderBy(asc(billingWebhookEvents.receivedAt)).limit(limit);
  let processed = 0;
  for (const row of pending) {
    const claimed = await db.update(billingWebhookEvents).set({ status: "processing", processingStartedAt: new Date(), attempts: sql`${billingWebhookEvents.attempts} + 1` })
      .where(and(eq(billingWebhookEvents.eventId, row.eventId), eq(billingWebhookEvents.status, "pending")))
      .returning({ eventId: billingWebhookEvents.eventId });
    if (!claimed.length) continue;
    try {
      await processEvent(row.payload as NormalizedPolarEvent);
      await db.update(billingWebhookEvents).set({ status: "processed", processedAt: new Date(), processingStartedAt: null, errorCode: null })
        .where(eq(billingWebhookEvents.eventId, row.eventId));
      processed++;
    } catch (error) {
      const code = error instanceof Error ? error.message.slice(0, 80) : "unknown";
      await db.update(billingWebhookEvents).set({ status: row.attempts + 1 >= 8 ? "failed" : "pending", processingStartedAt: null, errorCode: code })
        .where(eq(billingWebhookEvents.eventId, row.eventId));
    }
  }
  return { processed, scanned: pending.length };
}
