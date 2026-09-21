import { Hono } from "hono";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  adminAuditEvents,
  aiCreditAccounts,
  billingCustomers,
  billingEntitlements,
  billingSubscriptions,
  jobs,
  mcpAccessTokens,
  planUsageMonthly,
  sites,
  users,
} from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import { utcMonthStart } from "../services/billing-config.js";

// Admin-only customer console. Mounted under /api/admin, which the auth
// middleware restricts to role=admin; never exposed through MCP.
//
// Correlated subqueries name the outer column literally ("users"."id"):
// Drizzle leaves column references unqualified in single-table selects, which
// would bind to the subquery's own table instead.
export const cloudAdminRoutes = new Hono();

export const CUSTOMER_FILTERS = ["all", "transition", "past_due", "no_plan", "suspended"] as const;
export type CustomerFilter = (typeof CUSTOMER_FILTERS)[number];

export function parseCustomerFilter(value: string | undefined): CustomerFilter {
  return CUSTOMER_FILTERS.includes(value as CustomerFilter) ? value as CustomerFilter : "all";
}

export function suspensionReason(value: unknown) {
  if (typeof value !== "string") return null;
  const reason = value.trim();
  return reason.length >= 3 && reason.length <= 500 ? reason : null;
}

type CustomerRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  createdAt: Date;
  lastLoginAt: Date | null;
  suspendedAt: Date | null;
  plan: string | null;
  entitlementSource: string | null;
  entitlementStatus: string | null;
  entitlementExpiresAt: Date | null;
};

export function matchesCustomerFilter(row: Pick<CustomerRow, "plan" | "entitlementSource" | "entitlementStatus" | "suspendedAt">, filter: CustomerFilter) {
  if (filter === "transition") return row.entitlementSource === "transition";
  if (filter === "past_due") return row.entitlementStatus === "past_due";
  if (filter === "no_plan") return !row.plan || row.plan === "none" || row.entitlementStatus === "revoked";
  if (filter === "suspended") return Boolean(row.suspendedAt);
  return true;
}

cloudAdminRoutes.get("/", async (c) => {
  const query = (c.req.query("q") || "").trim().toLowerCase();
  const filter = parseCustomerFilter(c.req.query("filter"));
  const period = utcMonthStart();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      createdAt: users.createdAt,
      lastLoginAt: users.lastLoginAt,
      suspendedAt: users.suspendedAt,
      plan: billingEntitlements.planCode,
      entitlementSource: billingEntitlements.source,
      entitlementStatus: billingEntitlements.status,
      entitlementExpiresAt: billingEntitlements.expiresAt,
      sites: sql<number>`(select count(*)::int from sites s where s.user_id = "users"."id")`,
      posts: sql<number>`(select count(*)::int from posts p where p.user_id = "users"."id")`,
      draftsThisMonth: sql<number>`coalesce(${planUsageMonthly.manualCompleted} + ${planUsageMonthly.automatedCompleted}, 0)::int`,
    })
    .from(users)
    .leftJoin(billingEntitlements, eq(billingEntitlements.userId, users.id))
    .leftJoin(planUsageMonthly, and(eq(planUsageMonthly.userId, users.id), eq(planUsageMonthly.periodStart, period)))
    .orderBy(desc(users.createdAt));

  const customers = rows.filter((row) =>
    matchesCustomerFilter(row, filter)
    && (!query || row.email.toLowerCase().includes(query) || (row.displayName || "").toLowerCase().includes(query)));
  return c.json({ customers, total: rows.length });
});

cloudAdminRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      id: true, email: true, displayName: true, role: true, approvalStatus: true, emailVerified: true,
      workosUserId: true, createdAt: true, lastLoginAt: true, suspendedAt: true, suspendedReason: true, suspendedBy: true,
    },
  });
  if (!user) return c.json({ error: "Customer not found" }, 404);

  const [entitlement, subscriptions, billingCustomer, credits, usage, siteRows, recentJobs, jobStats, mcpTokens, audit] = await Promise.all([
    db.query.billingEntitlements.findFirst({ where: eq(billingEntitlements.userId, id) }),
    db.select({
      polarSubscriptionId: billingSubscriptions.polarSubscriptionId,
      planCode: billingSubscriptions.planCode,
      status: billingSubscriptions.status,
      currentPeriodEnd: billingSubscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: billingSubscriptions.cancelAtPeriodEnd,
      pastDueAt: billingSubscriptions.pastDueAt,
    }).from(billingSubscriptions).where(eq(billingSubscriptions.userId, id)).orderBy(desc(billingSubscriptions.providerModifiedAt)).limit(5),
    db.query.billingCustomers.findFirst({ where: eq(billingCustomers.userId, id) }),
    db.query.aiCreditAccounts.findFirst({ where: eq(aiCreditAccounts.userId, id) }),
    db.query.planUsageMonthly.findFirst({ where: and(eq(planUsageMonthly.userId, id), eq(planUsageMonthly.periodStart, utcMonthStart())) }),
    db.select({
      id: sites.id,
      name: sites.name,
      domain: sites.domain,
      status: sites.status,
      createdAt: sites.createdAt,
      posts: sql<number>`(select count(*)::int from posts p where p.site_id = "sites"."id")`,
      lastPostAt: sql<string | null>`(select max(p.created_at) from posts p where p.site_id = "sites"."id")`,
    }).from(sites).where(eq(sites.userId, id)).orderBy(sites.createdAt),
    db.select({
      id: jobs.id,
      status: jobs.status,
      currentStep: jobs.currentStep,
      sourceType: jobs.sourceType,
      errorMessage: jobs.errorMessage,
      createdAt: jobs.createdAt,
      completedAt: jobs.completedAt,
    }).from(jobs).where(eq(jobs.userId, id)).orderBy(desc(jobs.createdAt)).limit(10),
    db.select({
      total: sql<number>`count(*)::int`,
      failed7d: sql<number>`count(*) filter (where ${jobs.status} = 'failed' and ${jobs.createdAt} > now() - interval '7 days')::int`,
    }).from(jobs).where(eq(jobs.userId, id)),
    db.select({ active: sql<number>`count(*) filter (where ${mcpAccessTokens.revokedAt} is null)::int` }).from(mcpAccessTokens).where(eq(mcpAccessTokens.userId, id)),
    db.select({
      id: adminAuditEvents.id,
      action: adminAuditEvents.action,
      reason: adminAuditEvents.reason,
      createdAt: adminAuditEvents.createdAt,
      adminEmail: users.email,
    }).from(adminAuditEvents).leftJoin(users, eq(users.id, adminAuditEvents.adminUserId))
      .where(eq(adminAuditEvents.targetUserId, id)).orderBy(desc(adminAuditEvents.createdAt)).limit(20),
  ]);

  return c.json({
    customer: user,
    entitlement: entitlement ? {
      plan: entitlement.planCode,
      source: entitlement.source,
      status: entitlement.status,
      effectiveAt: entitlement.effectiveAt,
      expiresAt: entitlement.expiresAt,
    } : null,
    subscriptions,
    polarCustomerId: billingCustomer?.polarCustomerId || null,
    credits: credits ? { available: credits.availableCredits, reserved: credits.reservedCredits, debt: credits.debtCredits } : null,
    usage: {
      period: utcMonthStart(),
      manual: (usage?.manualCompleted || 0),
      automated: (usage?.automatedCompleted || 0),
      reserved: (usage?.manualReserved || 0) + (usage?.automatedReserved || 0),
    },
    sites: siteRows,
    jobs: { recent: recentJobs, total: jobStats[0]?.total || 0, failed7d: jobStats[0]?.failed7d || 0 },
    mcpTokensActive: mcpTokens[0]?.active || 0,
    audit,
  });
});

cloudAdminRoutes.post("/:id/suspend", async (c) => {
  const adminId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({})) as { reason?: unknown };
  const reason = suspensionReason(body.reason);
  if (!reason) return c.json({ error: "A reason of 3–500 characters is required" }, 400);
  if (id === adminId) return c.json({ error: "You cannot suspend your own account" }, 400);

  const result = await db.transaction(async (tx) => {
    const [target] = await tx.select({ role: users.role, suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, id)).for("update");
    if (!target) return { status: 404 as const, error: "Customer not found" };
    if (target.role === "admin") return { status: 400 as const, error: "Demote this admin before suspending the account" };
    if (target.suspendedAt) return { status: 409 as const, error: "Account is already suspended" };
    // Bumping session_version invalidates any legacy JWTs; WorkOS sessions and MCP
    // tokens are rejected on each request while suspended_at is set.
    await tx.update(users).set({
      suspendedAt: new Date(),
      suspendedReason: reason,
      suspendedBy: adminId,
      sessionVersion: sql`${users.sessionVersion} + 1`,
    } as never).where(eq(users.id, id));
    await tx.insert(adminAuditEvents).values({ adminUserId: adminId, targetUserId: id, action: "suspend", reason });
    return null;
  });
  if (result) return c.json({ error: result.error }, result.status);
  return c.json({ success: true });
});

cloudAdminRoutes.post("/:id/unsuspend", async (c) => {
  const adminId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json().catch(() => ({})) as { reason?: unknown };
  const reason = suspensionReason(body.reason);
  if (!reason) return c.json({ error: "A reason of 3–500 characters is required" }, 400);

  const result = await db.transaction(async (tx) => {
    const [target] = await tx.select({ suspendedAt: users.suspendedAt }).from(users).where(eq(users.id, id)).for("update");
    if (!target) return { status: 404 as const, error: "Customer not found" };
    if (!target.suspendedAt) return { status: 409 as const, error: "Account is not suspended" };
    await tx.update(users).set({ suspendedAt: null, suspendedReason: null, suspendedBy: null } as never).where(eq(users.id, id));
    await tx.insert(adminAuditEvents).values({ adminUserId: adminId, targetUserId: id, action: "unsuspend", reason });
    return null;
  });
  if (result) return c.json({ error: result.error }, result.status);
  return c.json({ success: true });
});
