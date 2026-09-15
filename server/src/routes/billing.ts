import { Webhooks } from "@polar-sh/hono";
import { and, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../db/index.js";
import { aiCreditAccounts, aiCreditGrants, aiCreditLedger, billingEntitlements, billingSubscriptions } from "../db/schema.js";
import { ApiError, readJsonObject, requiredEnum } from "../http/error-contract.js";
import { getUserId } from "../middleware/auth.js";
import { ensureGlobalSettings, updateGlobalSettings } from "../services/user-settings.js";
import { AI_CREDIT_PACK, BILLING_SKUS, PLAN_LIMITS, PAST_DUE_GRACE_MS, checkoutReturnPath, cloudCheckoutEnabled, isBillingSku, managedAiEnabled, planForSku, productIdForSku, refundableCents, utcMonthStart, type AiPreference, type PlanLimits } from "../services/billing-config.js";
import { appUrl, getPolarClient } from "../services/polar-client.js";
import { enqueuePolarWebhook, reconcilePolarCustomer } from "../services/billing-webhooks.js";
import { cloudEnforcementEnabled, getCloudAccess } from "../services/cloud-entitlements.js";

export const billingRoutes = new Hono();

function enabled() { return process.env.BLOGFACTORY_CLOUD === "true"; }

billingRoutes.get("/state", async (c) => {
  const userId = getUserId(c);
  const [access, entitlement, subscription, account, settings, nextGrant, eligibleRefunds, usageRows] = await Promise.all([
    getCloudAccess(userId),
    db.query.billingEntitlements.findFirst({ where: eq(billingEntitlements.userId, userId) }),
    db.query.billingSubscriptions.findFirst({ where: eq(billingSubscriptions.userId, userId), orderBy: desc(billingSubscriptions.providerModifiedAt) }),
    db.query.aiCreditAccounts.findFirst({ where: eq(aiCreditAccounts.userId, userId) }),
    ensureGlobalSettings(userId),
    db.query.aiCreditGrants.findFirst({ where: and(eq(aiCreditGrants.userId, userId), eq(aiCreditGrants.status, "active"), gt(aiCreditGrants.remainingCredits, 0)), orderBy: aiCreditGrants.expiresAt }),
    db.select({ id: aiCreditGrants.id, remainingCredits: aiCreditGrants.remainingCredits, purchasedAt: aiCreditGrants.createdAt })
      .from(aiCreditGrants).where(and(eq(aiCreditGrants.userId, userId), eq(aiCreditGrants.source, "purchase"), eq(aiCreditGrants.status, "active"), gt(aiCreditGrants.remainingCredits, 0), gt(aiCreditGrants.createdAt, new Date(Date.now() - 14 * 86_400_000)))),
    db.execute(sql<Record<string, unknown>>`SELECT
      COALESCE((SELECT manual_completed FROM plan_usage_monthly WHERE user_id = ${userId} AND period_start = ${utcMonthStart()}), 0) AS manual_completed,
      COALESCE((SELECT manual_reserved FROM plan_usage_monthly WHERE user_id = ${userId} AND period_start = ${utcMonthStart()}), 0) AS manual_reserved,
      COALESCE((SELECT automated_completed FROM plan_usage_monthly WHERE user_id = ${userId} AND period_start = ${utcMonthStart()}), 0) AS automated_completed,
      COALESCE((SELECT automated_reserved FROM plan_usage_monthly WHERE user_id = ${userId} AND period_start = ${utcMonthStart()}), 0) AS automated_reserved,
      (SELECT COUNT(*) FROM sites WHERE user_id = ${userId}) AS sites,
      (SELECT COUNT(*) FROM feeds WHERE user_id = ${userId} AND is_active = TRUE) AS active_feeds,
      COALESCE((SELECT SUM(file_size_bytes) FROM image_assets WHERE user_id = ${userId}), 0) AS storage_bytes,
      (SELECT COUNT(*) FROM jobs WHERE user_id = ${userId} AND status = 'running') AS concurrency`),
  ]);
  const graceEndsAt = subscription?.status === "past_due" && subscription.pastDueAt
    ? new Date(subscription.pastDueAt.getTime() + PAST_DUE_GRACE_MS) : null;
  const effectivePlan = !enabled() ? "internal" : entitlement?.planCode || "none";
  const limits = (entitlement?.limits || PLAN_LIMITS[effectivePlan as keyof typeof PLAN_LIMITS]) as PlanLimits;
  const usage = Object.fromEntries(Object.entries(usageRows[0] || {}).map(([key, value]) => [key, Number(value)]));
  const draftUsed = effectivePlan === "advanced"
    ? usage.automated_completed + usage.automated_reserved
    : usage.manual_completed + usage.manual_reserved + usage.automated_completed + usage.automated_reserved;
  const draftLimit = effectivePlan === "advanced" ? limits?.monthlyAutomatedDrafts : limits?.monthlyDrafts;
  return c.json({
    cloud: enabled(), cloud_enforcement: cloudEnforcementEnabled(), checkout_enabled: cloudCheckoutEnabled(),
    managed_ai_enabled: managedAiEnabled(), access_allowed: access.allowed, access_reason: access.reason, plan: effectivePlan, subscription_state: subscription?.status || null,
    entitlement_source: entitlement?.source || null,
    period_start: subscription?.currentPeriodStart || null, period_end: subscription?.currentPeriodEnd || entitlement?.expiresAt || null,
    cancel_at_period_end: subscription?.cancelAtPeriodEnd || false, grace_ends_at: graceEndsAt,
    limits, usage,
    warnings: { drafts_80_percent: typeof draftLimit === "number" && draftLimit > 0 && draftUsed / draftLimit >= 0.8 },
    ai_preference: settings.aiPreference as AiPreference,
    credits: { available: account?.availableCredits || 0, reserved: account?.reservedCredits || 0, debt: account?.debtCredits || 0, next_expiry: nextGrant?.expiresAt || null },
    eligible_refunds: eligibleRefunds.map((grant) => ({ grant_id: grant.id, purchased_at: grant.purchasedAt, remaining_credits: grant.remainingCredits, maximum_refund_cents: refundableCents(grant.remainingCredits) })),
  });
});

billingRoutes.post("/checkout", async (c) => {
  if (!cloudCheckoutEnabled()) throw new ApiError(403, "forbidden", "Cloud checkout is not open yet");
  const body = await readJsonObject(c);
  if (!isBillingSku(body.sku)) throw new ApiError(400, "validation_error", `sku must be one of: ${BILLING_SKUS.join(", ")}`);
  if (!planForSku(body.sku) && !managedAiEnabled()) throw new ApiError(403, "forbidden", "Managed AI Credits are not available yet");
  const productId = productIdForSku(body.sku);
  if (!productId) throw new ApiError(503, "service_unavailable", "This billing product is not configured");
  const userId = getUserId(c);
  if (planForSku(body.sku)) {
    const existing = await db.query.billingSubscriptions.findFirst({ where: and(
      eq(billingSubscriptions.userId, userId),
      inArray(billingSubscriptions.status, ["active", "canceled", "past_due"]),
    ) });
    if (existing && (!existing.currentPeriodEnd || existing.currentPeriodEnd > new Date())) {
      throw new ApiError(409, "conflict", "Manage the existing subscription in the billing portal");
    }
  }
  const base = appUrl();
  const returnPath = checkoutReturnPath(body.return_path);
  const checkout = await getPolarClient().checkouts.create({
    products: [productId], externalCustomerId: userId,
    metadata: { sku: body.sku, blogfactory_user_id: userId },
    successUrl: `${base}${returnPath}?checkout=success&checkout_id={CHECKOUT_ID}`,
    returnUrl: `${base}${returnPath}`, allowDiscountCodes: false, allowTrial: false,
  });
  return c.json({ url: checkout.url });
});

billingRoutes.post("/portal", async (c) => {
  if (!enabled()) throw new ApiError(403, "forbidden", "Cloud billing is disabled");
  const userId = getUserId(c);
  const session = await getPolarClient().customerSessions.create({ externalCustomerId: userId, returnUrl: `${appUrl()}/billing` });
  return c.json({ url: session.customerPortalUrl });
});

billingRoutes.post("/reconcile", async (c) => {
  if (!enabled()) throw new ApiError(403, "forbidden", "Cloud billing is disabled");
  return c.json(await reconcilePolarCustomer(getUserId(c)));
});

billingRoutes.patch("/ai-preference", async (c) => {
  const body = await readJsonObject(c);
  const preference = requiredEnum(body, "preference", ["auto", "byo", "managed"] as const);
  if (preference === "managed" && !managedAiEnabled()) throw new ApiError(403, "forbidden", "Managed AI is not available yet");
  await updateGlobalSettings(getUserId(c), { aiPreference: preference });
  return c.json({ ai_preference: preference });
});

billingRoutes.get("/credits/ledger", async (c) => {
  const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 50));
  const cursor = c.req.query("cursor");
  const conditions = [eq(aiCreditLedger.userId, getUserId(c))];
  if (cursor && !Number.isNaN(Date.parse(cursor))) conditions.push(lt(aiCreditLedger.createdAt, new Date(cursor)));
  const rows = await db.select({
    id: aiCreditLedger.id, type: aiCreditLedger.entryType, credits: aiCreditLedger.credits,
    reference_type: aiCreditLedger.referenceType, created_at: aiCreditLedger.createdAt,
  }).from(aiCreditLedger).where(and(...conditions)).orderBy(desc(aiCreditLedger.createdAt)).limit(limit + 1);
  return c.json({ items: rows.slice(0, limit), next_cursor: rows.length > limit ? rows[limit - 1]?.created_at.toISOString() : null });
});

export const polarWebhookRoute = new Hono();
polarWebhookRoute.post("/polar", async (c) => {
  const secret = process.env.POLAR_WEBHOOK_SECRET?.trim();
  if (!secret) throw new ApiError(503, "service_unavailable", "Polar webhook is not configured");
  const eventId = c.req.header("webhook-id") || c.req.header("Webhook-Id") || "";
  if (!eventId) throw new ApiError(400, "validation_error", "Missing webhook id");
  const verified = await Webhooks({ webhookSecret: secret, onPayload: (payload) => enqueuePolarWebhook(eventId, payload) })(c);
  return verified.ok ? c.json({ received: true }, 202) : verified;
});

export { AI_CREDIT_PACK };
