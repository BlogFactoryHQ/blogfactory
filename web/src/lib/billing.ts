export type BillingState = {
  cloud: boolean;
  cloud_enforcement: boolean;
  checkout_enabled: boolean;
  managed_ai_enabled: boolean;
  access_allowed: boolean;
  access_reason: string | null;
  plan: string;
  subscription_state: string | null;
  entitlement_source: string | null;
  period_end: string | null;
  grace_ends_at: string | null;
  ai_preference: "auto" | "byo" | "managed";
  credits: { available: number; reserved: number; debt: number; next_expiry: string | null };
  eligible_refunds: Array<{ grant_id: string; purchased_at: string; remaining_credits: number; maximum_refund_cents: number }>;
  limits: { sites: number | null; storageBytes: number | null; concurrency: number | null; activeFeeds: number | null; monthlyDrafts: number | null; monthlyAutomatedDrafts: number | null };
  usage: { sites: number; storage_bytes: number; concurrency: number; active_feeds: number; manual_completed: number; manual_reserved: number; automated_completed: number; automated_reserved: number };
  warnings: { drafts_80_percent: boolean; drafts_limit_reached?: boolean };
};

export const CLOUD_PLANS = [
  { name: "Cloud", monthly: "$5", yearly: "$49", monthlySku: "cloud_monthly", yearlySku: "cloud_yearly", detail: "3 sites · 1 GB · 3 RSS · 150 successful drafts/month" },
  { name: "Advanced", monthly: "$15", yearly: "$149", monthlySku: "advanced_monthly", yearlySku: "advanced_yearly", detail: "10 sites · 10 GB · 20 RSS · unlimited manual + 600 automated drafts/month" },
] as const;

export function requiresCloudPlan(state: BillingState | undefined) {
  return Boolean(state?.cloud_enforcement && !state.access_allowed);
}

export function transitionDaysRemaining(state: BillingState | undefined, now = Date.now()) {
  if (state?.entitlement_source !== "transition" || !state.period_end) return null;
  return Math.max(0, Math.ceil((new Date(state.period_end).getTime() - now) / 86_400_000));
}

// Checkout success alone never grants access; activation is confirmed only once the Polar webhook lands.
export function isCheckoutActivated(state: BillingState | undefined, baselineCredits: number | null) {
  if (!state) return false;
  if (state.entitlement_source === "polar" && state.access_allowed) return true;
  return baselineCredits !== null && state.credits.available > baselineCredits;
}
