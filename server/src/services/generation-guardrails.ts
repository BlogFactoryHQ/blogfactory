export type GuardrailId = "monthly_budget" | "daily_cost" | "daily_requests" | "daily_failures";

export type GuardrailLimits = {
  monthlyBudget?: number | null;
  dailyCostLimit?: number | null;
  dailyRequestLimit?: number | null;
  dailyFailureLimit?: number | null;
};

export type GuardrailUsage = {
  monthSpend: number;
  todaySpend: number;
  todayRequests: number;
  todayFailures: number;
};

export type GuardrailBlock = {
  id: GuardrailId;
  message: string;
};

/**
 * The monthly budget is enforced elsewhere because it latches `budget_paused`; these daily
 * ceilings intentionally do not latch. They stop generation for the rest of the UTC day and
 * clear themselves at midnight, so a spike cannot silently disable an account.
 *
 * Failures are deliberately not enforced: refusing to generate because earlier calls failed
 * would turn a provider outage into a self-inflicted outage. The failure ceiling is a watch
 * rule that the UI surfaces, nothing more.
 */
export function evaluateDailyGuardrails(limits: GuardrailLimits, usage: GuardrailUsage): GuardrailBlock | null {
  const costLimit = positive(limits.dailyCostLimit);
  if (costLimit !== null && usage.todaySpend >= costLimit) {
    return {
      id: "daily_cost",
      message: `Daily spend ceiling reached — $${usage.todaySpend.toFixed(2)} of $${costLimit.toFixed(2)} today. Generation resumes tomorrow (UTC) or when the ceiling is raised.`,
    };
  }

  const requestLimit = positive(limits.dailyRequestLimit);
  if (requestLimit !== null && usage.todayRequests >= requestLimit) {
    return {
      id: "daily_requests",
      message: `Daily request ceiling reached — ${usage.todayRequests} of ${requestLimit} model calls today. Generation resumes tomorrow (UTC) or when the ceiling is raised.`,
    };
  }

  return null;
}

/** Shared by the settings route so a guardrail is either a positive number or off. */
export function normalizeGuardrailLimit(value: unknown, kind: "cost" | "count"): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return kind === "count" ? Math.floor(parsed) : parsed;
}

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
