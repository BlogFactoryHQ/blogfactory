import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { billingEntitlements, billingSubscriptions } from "../db/schema.js";
import { PAST_DUE_GRACE_MS, PLAN_LIMITS, type PlanCode } from "./billing-config.js";

export function cloudEnforcementEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.BLOGFACTORY_CLOUD === "true" && env.CLOUD_BILLING_ENFORCEMENT === "true";
}

export async function getCloudAccess(userId: string, now = new Date(), force = false) {
  if (process.env.BLOGFACTORY_CLOUD !== "true" || (!force && !cloudEnforcementEnabled())) return { allowed: true, plan: "internal" as PlanCode, limits: PLAN_LIMITS.internal, reason: null };
  const [entitlement, subscription] = await Promise.all([
    db.query.billingEntitlements.findFirst({ where: eq(billingEntitlements.userId, userId) }),
    db.query.billingSubscriptions.findFirst({ where: eq(billingSubscriptions.userId, userId), orderBy: desc(billingSubscriptions.providerModifiedAt) }),
  ]);
  if (!entitlement) return { allowed: false, plan: "none" as PlanCode, limits: PLAN_LIMITS.none, reason: "subscription_required" };
  const plan = entitlement.planCode as PlanCode;
  if (entitlement.expiresAt && entitlement.expiresAt <= now) return { allowed: false, plan, limits: PLAN_LIMITS[plan], reason: "entitlement_expired" };
  if (entitlement.status === "active" || entitlement.status === "canceled") return { allowed: true, plan, limits: PLAN_LIMITS[plan], reason: null };
  if (entitlement.status === "past_due" && subscription?.pastDueAt && subscription.pastDueAt.getTime() + PAST_DUE_GRACE_MS > now.getTime()) {
    return { allowed: true, plan, limits: PLAN_LIMITS[plan], reason: "past_due_grace" };
  }
  return { allowed: false, plan, limits: PLAN_LIMITS[plan], reason: entitlement.status === "past_due" ? "past_due" : "subscription_revoked" };
}
