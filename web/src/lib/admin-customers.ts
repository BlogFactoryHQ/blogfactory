import type { StatusType } from "@/components/ui/status-badge";

export const CUSTOMER_FILTERS = [
  { value: "all", label: "All" },
  { value: "transition", label: "Transition grant" },
  { value: "past_due", label: "Past due" },
  { value: "no_plan", label: "No plan" },
  { value: "suspended", label: "Suspended" },
] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number]["value"];

export interface CustomerSummary {
  id: string;
  email: string;
  displayName: string | null;
  role: "admin" | "user";
  createdAt: string;
  lastLoginAt: string | null;
  suspendedAt: string | null;
  plan: string | null;
  entitlementSource: string | null;
  entitlementStatus: string | null;
  entitlementExpiresAt: string | null;
  sites: number;
  posts: number;
  draftsThisMonth: number;
}

export interface CustomerDetail {
  customer: {
    id: string;
    email: string;
    displayName: string | null;
    role: "admin" | "user";
    approvalStatus: string;
    emailVerified: boolean;
    workosUserId: string | null;
    createdAt: string;
    lastLoginAt: string | null;
    suspendedAt: string | null;
    suspendedReason: string | null;
  };
  entitlement: { plan: string; source: string; status: string; effectiveAt: string; expiresAt: string | null } | null;
  subscriptions: Array<{ polarSubscriptionId: string; planCode: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean; pastDueAt: string | null }>;
  polarCustomerId: string | null;
  credits: { available: number; reserved: number; debt: number } | null;
  usage: { period: string; manual: number; automated: number; reserved: number };
  sites: Array<{ id: string; name: string; domain: string; status: string; createdAt: string; posts: number; lastPostAt: string | null }>;
  jobs: {
    recent: Array<{ id: string; status: string; currentStep: string; sourceType: string; errorMessage: string | null; createdAt: string; completedAt: string | null }>;
    total: number;
    failed7d: number;
  };
  mcpTokensActive: number;
  audit: Array<{ id: string; action: string; reason: string | null; createdAt: string; adminEmail: string | null }>;
}

const PLAN_LABELS: Record<string, string> = { none: "No plan", cloud: "Cloud", advanced: "Advanced", internal: "Internal" };

export function planLabel(plan: string | null | undefined) {
  return PLAN_LABELS[plan || "none"] || plan || "No plan";
}

export function accessStatus(row: Pick<CustomerSummary, "suspendedAt" | "plan" | "entitlementStatus" | "entitlementExpiresAt">, now = Date.now()): { status: StatusType; label: string } {
  if (row.suspendedAt) return { status: "error", label: "Suspended" };
  if (!row.plan || row.plan === "none" || !row.entitlementStatus) return { status: "draft", label: "No plan" };
  if (row.entitlementExpiresAt && new Date(row.entitlementExpiresAt).getTime() <= now) return { status: "warning", label: "Expired" };
  if (row.entitlementStatus === "past_due") return { status: "warning", label: "Past due" };
  if (row.entitlementStatus === "revoked") return { status: "draft", label: "Revoked" };
  if (row.entitlementStatus === "canceled") return { status: "paused", label: "Canceling" };
  return { status: "active", label: "Active" };
}

export function formatDate(value: string | null | undefined, empty = "—") {
  return value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : empty;
}

export function formatDateTime(value: string | null | undefined, empty = "Never") {
  return value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : empty;
}
