export type BillingState = {
  cloud_enforcement: boolean;
  checkout_enabled: boolean;
  managed_ai_enabled?: boolean;
  write_access?: boolean;
  plan: string;
  subscription_state: string | null;
  entitlement_source: string | null;
  period_end: string | null;
  grace_ends_at: string | null;
  credits: { available: number; reserved: number; debt: number; next_expiry: string | null };
  eligible_refunds: Array<{ grant_id: string; purchased_at: string; remaining_credits: number; maximum_refund_cents: number }>;
  limits: { sites: number | null; storageBytes: number | null; concurrency: number | null; activeFeeds: number | null; monthlyDrafts: number | null; monthlyAutomatedDrafts: number | null };
  usage: { sites: number; storage_bytes: number; concurrency: number; active_feeds: number; manual_completed: number; manual_reserved: number; automated_completed: number; automated_reserved: number };
  warnings: { drafts_80_percent: boolean; drafts_limit_reached?: boolean };
};

// Checkout success alone never grants access; activation is confirmed only once the Polar webhook lands.
export function isCheckoutActivated(state: BillingState | undefined, baselineCredits: number | null) {
  if (!state) return false;
  if (state.entitlement_source === "polar" && state.write_access !== false) return true;
  return baselineCredits !== null && state.credits.available > baselineCredits;
}
