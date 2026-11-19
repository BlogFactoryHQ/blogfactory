export const BILLING_SKUS = [
  "cloud_monthly",
  "cloud_yearly",
  "advanced_monthly",
  "advanced_yearly",
  "ai_credits_14000",
] as const;

export type BillingSku = typeof BILLING_SKUS[number];
export type PlanCode = "none" | "cloud" | "advanced" | "internal";
export type AiPreference = "auto" | "byo" | "managed";

export type PlanLimits = {
  sites: number | null;
  storageBytes: number | null;
  concurrency: number | null;
  activeFeeds: number | null;
  feedMinimumMinutes: number | null;
  monthlyDrafts: number | null;
  monthlyAutomatedDrafts: number | null;
};

const GB = 1_000_000_000;

export const PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  none: { sites: 0, storageBytes: 0, concurrency: 0, activeFeeds: 0, feedMinimumMinutes: null, monthlyDrafts: 0, monthlyAutomatedDrafts: 0 },
  cloud: { sites: 3, storageBytes: GB, concurrency: 1, activeFeeds: 3, feedMinimumMinutes: 360, monthlyDrafts: 150, monthlyAutomatedDrafts: null },
  advanced: { sites: 10, storageBytes: 10 * GB, concurrency: 3, activeFeeds: 20, feedMinimumMinutes: 30, monthlyDrafts: null, monthlyAutomatedDrafts: 600 },
  internal: { sites: null, storageBytes: null, concurrency: null, activeFeeds: null, feedMinimumMinutes: null, monthlyDrafts: null, monthlyAutomatedDrafts: null },
};

export const AI_CREDIT_PACK = { sku: "ai_credits_14000" as const, priceCents: 2_000, credits: 14_000, validDays: 365 };
export const PAST_DUE_GRACE_MS = 72 * 60 * 60 * 1000;

export const PRODUCT_ENV: Record<BillingSku, string> = {
  cloud_monthly: "POLAR_PRODUCT_CLOUD_MONTHLY",
  cloud_yearly: "POLAR_PRODUCT_CLOUD_YEARLY",
  advanced_monthly: "POLAR_PRODUCT_ADVANCED_MONTHLY",
  advanced_yearly: "POLAR_PRODUCT_ADVANCED_YEARLY",
  ai_credits_14000: "POLAR_PRODUCT_AI_CREDITS_14000",
};

export function productIdForSku(sku: BillingSku, env: NodeJS.ProcessEnv = process.env) {
  return env[PRODUCT_ENV[sku]]?.trim() || null;
}

export function skuForProductId(productId: string, env: NodeJS.ProcessEnv = process.env): BillingSku | null {
  return BILLING_SKUS.find((sku) => productIdForSku(sku, env) === productId) || null;
}

export function planForSku(sku: BillingSku): PlanCode | null {
  if (sku.startsWith("cloud_")) return "cloud";
  if (sku.startsWith("advanced_")) return "advanced";
  return null;
}

export function utcMonthStart(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function creditsForProviderCost(costUsd: number) {
  if (!Number.isFinite(costUsd) || costUsd < 0) throw new Error("Provider cost must be a non-negative number");
  return Math.ceil(costUsd * 1_000);
}

export function reservationCredits(estimatedCostUsd: number) {
  return Math.max(1, Math.ceil(creditsForProviderCost(estimatedCostUsd) * 1.2));
}

export function refundableCents(remainingCredits: number, grantedCredits = AI_CREDIT_PACK.credits, priceCents = AI_CREDIT_PACK.priceCents) {
  return Math.max(0, Math.floor(priceCents * Math.min(Math.max(remainingCredits, 0), grantedCredits) / grantedCredits));
}

export function isBillingSku(value: unknown): value is BillingSku {
  return typeof value === "string" && BILLING_SKUS.includes(value as BillingSku);
}

export function cloudCheckoutEnabled(env: NodeJS.ProcessEnv = process.env, now = new Date()) {
  const launchAt = Date.parse(env.CLOUD_PUBLIC_LAUNCH_AT || "");
  return env.BLOGFACTORY_CLOUD === "true"
    && env.CLOUD_PUBLIC_SIGNUP === "true"
    && Number.isFinite(launchAt)
    && launchAt <= now.getTime();
}

export function managedAiEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.BLOGFACTORY_CLOUD === "true" && env.MANAGED_AI_ENABLED === "true";
}

const CHECKOUT_RETURN_PATHS = ["/billing", "/onboarding"] as const;

export function checkoutReturnPath(value: unknown) {
  return CHECKOUT_RETURN_PATHS.find((path) => path === value) || "/billing";
}
