import { Hono } from "hono";
import { and, count, desc, eq, lt } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs, schedulerLogs, searchConsoleIntegrations, userApiKeys, users } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import { accountCredentialStatus } from "../services/api-keys.js";

export const adminRoutes = new Hono();

function userRow(row: any) {
  const openrouterCredentialStatus = accountCredentialStatus("openrouter", row.openrouterApiKeyEncrypted);
  const googleAiCredentialStatus = accountCredentialStatus("google", row.googleAiKeyEncrypted);
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    role: row.role,
    approvalStatus: row.approvalStatus,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy,
    rejectedAt: row.rejectedAt,
    rejectedReason: row.rejectedReason,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    hasOpenrouterKey: openrouterCredentialStatus === "usable",
    openrouterKeyLast4: openrouterCredentialStatus === "usable" ? row.openrouterKeyLast4 || null : null,
    openrouterCredentialStatus,
    hasGoogleAiKey: googleAiCredentialStatus === "usable",
    googleKeyLast4: googleAiCredentialStatus === "usable" ? row.googleKeyLast4 || null : null,
    googleAiCredentialStatus,
  };
}

adminRoutes.get("/users", async (c) => {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      approvalStatus: users.approvalStatus,
      approvedAt: users.approvedAt,
      approvedBy: users.approvedBy,
      rejectedAt: users.rejectedAt,
      rejectedReason: users.rejectedReason,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      openrouterApiKeyEncrypted: userApiKeys.openrouterApiKeyEncrypted,
      openrouterKeyLast4: userApiKeys.openrouterKeyLast4,
      googleAiKeyEncrypted: userApiKeys.googleAiKeyEncrypted,
      googleKeyLast4: userApiKeys.googleKeyLast4,
    })
    .from(users)
    .leftJoin(userApiKeys, eq(userApiKeys.userId, users.id))
    .orderBy(desc(users.createdAt));

  return c.json(rows.map(userRow));
});

adminRoutes.get("/status", async (c) => {
  const staleBefore = new Date(Date.now() - 60 * 60 * 1000);
  const [jobCounts, [latestScheduler], [staleJobs], searchConsole] = await Promise.all([
    db.select({ status: jobs.status, count: count() }).from(jobs).groupBy(jobs.status),
    db.select({ triggeredAt: schedulerLogs.triggeredAt }).from(schedulerLogs).orderBy(desc(schedulerLogs.triggeredAt)).limit(1),
    db.select({ count: count() }).from(jobs).where(and(eq(jobs.status, "running"), lt(jobs.createdAt, staleBefore))),
    db.select({
      propertyUrl: searchConsoleIntegrations.propertyUrl,
      status: searchConsoleIntegrations.status,
      lastSyncAt: searchConsoleIntegrations.lastSyncAt,
      lastTestResult: searchConsoleIntegrations.lastTestResult,
    }).from(searchConsoleIntegrations).orderBy(searchConsoleIntegrations.propertyUrl),
  ]);

  const schedulerAge = latestScheduler ? Date.now() - latestScheduler.triggeredAt.getTime() : Infinity;
  const hasIssue = Number(staleJobs?.count || 0) > 0
    || schedulerAge > 30 * 60 * 60 * 1000
    || searchConsole.some((integration) => integration.status !== "connected");

  return c.json({
    status: hasIssue ? "needs_attention" : "operational",
    checkedAt: new Date().toISOString(),
    jobs: Object.fromEntries(jobCounts.map((row) => [row.status, Number(row.count)])),
    staleRunningJobs: Number(staleJobs?.count || 0),
    scheduler: { lastRunAt: latestScheduler?.triggeredAt?.toISOString() || null },
    searchConsole: searchConsole.map((integration) => ({
      ...integration,
      lastSyncAt: integration.lastSyncAt?.toISOString() || null,
    })),
  });
});

adminRoutes.post("/users/:id/approve", async (c) => {
  const adminId = getUserId(c);
  const id = c.req.param("id");

  const [updated] = await db
    .update(users)
    .set({
      approvalStatus: "approved",
      approvedAt: new Date(),
      approvedBy: adminId,
      rejectedAt: null,
      rejectedReason: null,
    })
    .where(eq(users.id, id))
    .returning();

  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ success: true });
});

adminRoutes.post("/users/:id/reject", async (c) => {
  const currentUserId = getUserId(c);
  const id = c.req.param("id");
  const { reason } = await c.req.json().catch(() => ({ reason: null }));

  if (id === currentUserId) {
    return c.json({ error: "You cannot reject your own admin account" }, 400);
  }

  const [updated] = await db
    .update(users)
    .set({
      approvalStatus: "rejected",
      rejectedAt: new Date(),
      rejectedReason: reason || null,
    })
    .where(eq(users.id, id))
    .returning();

  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ success: true });
});

adminRoutes.post("/users/:id/revoke", async (c) => {
  const currentUserId = getUserId(c);
  const id = c.req.param("id");

  if (id === currentUserId) {
    return c.json({ error: "You cannot revoke your own admin account" }, 400);
  }

  const [updated] = await db
    .update(users)
    .set({
      approvalStatus: "pending",
      approvedAt: null,
      approvedBy: null,
      rejectedAt: null,
      rejectedReason: null,
    })
    .where(eq(users.id, id))
    .returning();

  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ success: true });
});

adminRoutes.post("/users/:id/role", async (c) => {
  const currentUserId = getUserId(c);
  const id = c.req.param("id");
  const { role } = await c.req.json();

  if (role !== "admin" && role !== "user") {
    return c.json({ error: "Invalid role" }, 400);
  }
  if (id === currentUserId && role !== "admin") {
    return c.json({ error: "You cannot demote your own admin account" }, 400);
  }

  const set =
    role === "admin"
      ? {
          role,
          approvalStatus: "approved",
          approvedAt: new Date(),
          rejectedAt: null,
          rejectedReason: null,
        }
      : { role };

  const [updated] = await db
    .update(users)
    .set(set)
    .where(eq(users.id, id))
    .returning();

  if (!updated) return c.json({ error: "User not found" }, 404);
  return c.json({ success: true });
});
