import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { adminAuditEvents, aiCreditAccounts, aiCreditGrants, aiCreditLedger, billingEntitlements, sites, users } from "../db/schema.js";
import { PLAN_LIMITS, type PlanCode } from "./billing-config.js";

export type AdminActionResult = { ok: true; details?: Record<string, unknown> } | { ok: false; status: 400 | 404 | 409; error: string };

const GRANTABLE_PLANS = ["cloud", "advanced", "internal"] as const;
type GrantablePlan = (typeof GRANTABLE_PLANS)[number];
const MAX_GRANT_DAYS = 3 * 366;
export const MAX_ADMIN_CREDITS = 1_000_000;

export function parsePlanGrant(body: { plan?: unknown; expiresAt?: unknown }, now = new Date()):
  { plan: GrantablePlan; expiresAt: Date | null } | { error: string } {
  if (!GRANTABLE_PLANS.includes(body.plan as GrantablePlan)) return { error: "Plan must be cloud, advanced or internal" };
  if (body.expiresAt === null) {
    return body.plan === "internal" ? { plan: "internal", expiresAt: null } : { error: "Only the internal plan can be granted without an end date" };
  }
  if (typeof body.expiresAt !== "string") return { error: "An end date is required" };
  const expiresAt = new Date(body.expiresAt);
  if (Number.isNaN(expiresAt.getTime())) return { error: "End date is not a valid date" };
  if (expiresAt.getTime() <= now.getTime()) return { error: "End date must be in the future" };
  if (expiresAt.getTime() > now.getTime() + MAX_GRANT_DAYS * 86_400_000) return { error: "End date must be within three years" };
  return { plan: body.plan as GrantablePlan, expiresAt };
}

export function parseCreditGrant(body: { credits?: unknown; expiresAt?: unknown }, now = new Date()):
  { credits: number; expiresAt: Date } | { error: string } {
  const credits = body.credits;
  if (typeof credits !== "number" || !Number.isInteger(credits) || credits <= 0 || credits > MAX_ADMIN_CREDITS) {
    return { error: `Credits must be a whole number between 1 and ${MAX_ADMIN_CREDITS.toLocaleString("en-US")}` };
  }
  const expiresAt = new Date(typeof body.expiresAt === "string" ? body.expiresAt : "");
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) return { error: "Credits need a future expiry date" };
  if (expiresAt.getTime() > now.getTime() + MAX_GRANT_DAYS * 86_400_000) return { error: "Expiry must be within three years" };
  return { credits, expiresAt };
}

// A paying Polar subscription owns the entitlement row; admin grants must not
// silently replace it (the next webhook would overwrite the grant anyway).
export function polarOwnsEntitlement(entitlement: { source: string; status: string; expiresAt: Date | null } | undefined, now = new Date()) {
  return Boolean(entitlement && entitlement.source === "polar" && entitlement.status !== "revoked"
    && (!entitlement.expiresAt || entitlement.expiresAt.getTime() > now.getTime()));
}

function entitlementSnapshot(row: { planCode: string; source: string; status: string; expiresAt: Date | null } | undefined) {
  return row ? { plan: row.planCode, source: row.source, status: row.status, expiresAt: row.expiresAt?.toISOString() || null } : null;
}

export async function grantPlan(adminId: string, userId: string, grant: { plan: GrantablePlan; expiresAt: Date | null }, reason: string): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    if (!target) return { ok: false, status: 404, error: "Customer not found" };
    const current = await tx.query.billingEntitlements.findFirst({ where: eq(billingEntitlements.userId, userId) });
    if (polarOwnsEntitlement(current)) return { ok: false, status: 409, error: "This customer has a paid Polar subscription. Change it in Polar instead." };
    const now = new Date();
    const values = {
      planCode: grant.plan as PlanCode, source: "admin", status: "active", effectiveAt: now,
      expiresAt: grant.expiresAt, limits: PLAN_LIMITS[grant.plan], updatedAt: now,
    };
    await tx.insert(billingEntitlements).values({ userId, ...values })
      .onConflictDoUpdate({ target: billingEntitlements.userId, set: { ...values, version: sql`${billingEntitlements.version} + 1` } });
    const details = { before: entitlementSnapshot(current), after: { plan: grant.plan, source: "admin", status: "active", expiresAt: grant.expiresAt?.toISOString() || null } };
    await tx.insert(adminAuditEvents).values({ adminUserId: adminId, targetUserId: userId, action: "grant_plan", reason, details });
    return { ok: true, details };
  });
}

export async function revokePlan(adminId: string, userId: string, reason: string): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(billingEntitlements).where(eq(billingEntitlements.userId, userId)).for("update");
    if (!current || current.status === "revoked") return { ok: false, status: 409, error: "There is no active plan to revoke" };
    if (current.source === "polar") return { ok: false, status: 409, error: "Paid Polar plans are cancelled or refunded in Polar" };
    const now = new Date();
    await tx.update(billingEntitlements).set({ status: "revoked", expiresAt: now, updatedAt: now, version: sql`${billingEntitlements.version} + 1` })
      .where(eq(billingEntitlements.userId, userId));
    const details = { before: entitlementSnapshot(current) };
    await tx.insert(adminAuditEvents).values({ adminUserId: adminId, targetUserId: userId, action: "revoke_plan", reason, details });
    return { ok: true, details };
  });
}

export async function grantCredits(adminId: string, userId: string, grant: { credits: number; expiresAt: Date }, reason: string): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    if (!target) return { ok: false, status: 404, error: "Customer not found" };
    const sourceRef = `admin:${randomUUID()}`;
    const [created] = await tx.insert(aiCreditGrants).values({
      userId, source: "admin", sourceRef, grantedCredits: grant.credits, remainingCredits: grant.credits, expiresAt: grant.expiresAt,
    }).returning({ id: aiCreditGrants.id });
    await tx.insert(aiCreditAccounts).values({ userId, availableCredits: grant.credits })
      .onConflictDoUpdate({ target: aiCreditAccounts.userId, set: { availableCredits: sql`${aiCreditAccounts.availableCredits} + ${grant.credits}`, updatedAt: new Date() } });
    await tx.insert(aiCreditLedger).values({
      userId, entryType: "manual_adjustment", credits: grant.credits, idempotencyKey: sourceRef,
      referenceType: "admin_grant", referenceId: created.id, metadata: { admin_user_id: adminId, reason },
    });
    const details = { credits: grant.credits, expiresAt: grant.expiresAt.toISOString(), grantId: created.id };
    await tx.insert(adminAuditEvents).values({ adminUserId: adminId, targetUserId: userId, action: "grant_credits", reason, details });
    return { ok: true, details };
  });
}

// Tables whose rows carry both user_id and site_id; each moves with the site.
export const SITE_SCOPED_TABLES = [
  "feeds", "campaigns", "posts", "jobs", "operation_events", "site_integrations", "post_publications",
  "indexing_integrations", "indexing_submissions", "search_console_integrations", "search_console_metrics",
  "search_console_url_inspections", "search_console_query_cache", "optimize_pages", "optimize_analyses",
] as const;

// Moves one site and everything generated for it to another account. Brand
// voices (personas) are account-level, so the ones the site uses are copied to
// the target and re-pointed rather than shared across tenants.
export async function transferSite(adminId: string, siteId: string, targetEmail: string, reason: string): Promise<AdminActionResult> {
  return db.transaction(async (tx) => {
    const [site] = await tx.select({ id: sites.id, userId: sites.userId, name: sites.name, domain: sites.domain }).from(sites).where(eq(sites.id, siteId)).for("update");
    if (!site) return { ok: false, status: 404, error: "Site not found" };
    const [target] = await tx.select({ id: users.id, email: users.email }).from(users).where(sql`lower(${users.email}) = ${targetEmail.trim().toLowerCase()}`);
    if (!target) return { ok: false, status: 404, error: "No account with that email" };
    if (target.id === site.userId) return { ok: false, status: 400, error: "The site already belongs to that account" };
    const from = site.userId;
    const to = target.id;

    // Refuse while the worker may be writing to the site; stale rows older than six hours do not block.
    const running = await tx.execute(sql`SELECT 1 FROM jobs WHERE site_id = ${siteId} AND status IN ('pending', 'queued', 'processing', 'running') AND created_at > now() - interval '6 hours' LIMIT 1`);
    if (running.length) return { ok: false, status: 409, error: "The site has jobs in progress. Wait for them to finish and try again." };

    const personaRows = await tx.execute(sql<{ persona_id: string }>`
      SELECT DISTINCT persona_id FROM (
        SELECT persona_id FROM feeds WHERE site_id = ${siteId}
        UNION SELECT persona_id FROM campaigns WHERE site_id = ${siteId}
        UNION SELECT persona_id FROM posts WHERE site_id = ${siteId}
        UNION SELECT persona_id FROM jobs WHERE site_id = ${siteId}
      ) used WHERE persona_id IS NOT NULL`);
    const personaMap: Record<string, string> = {};
    for (const row of personaRows) {
      const oldId = String(row.persona_id);
      const [copy] = await tx.execute(sql<{ id: string }>`
        INSERT INTO personas
        SELECT (jsonb_populate_record(NULL::personas, to_jsonb(p) || jsonb_build_object('id', gen_random_uuid(), 'user_id', ${to}::uuid, 'created_at', now(), 'updated_at', now()))).*
        FROM personas p WHERE p.id = ${oldId}::uuid AND p.user_id = ${from}::uuid
        RETURNING id`);
      if (copy) personaMap[oldId] = String(copy.id);
    }

    const moved: Record<string, number> = {};
    const count = (rows: unknown) => (rows as { count?: number }).count ?? (rows as unknown[]).length;
    for (const table of SITE_SCOPED_TABLES) {
      const result = await tx.execute(sql`UPDATE ${sql.identifier(table)} SET user_id = ${to} WHERE site_id = ${siteId} AND user_id = ${from}`);
      moved[table] = count(result);
    }
    const children: Array<[string, ReturnType<typeof sql>]> = [
      ["post_revisions", sql`UPDATE post_revisions SET user_id = ${to} WHERE user_id = ${from} AND post_id IN (SELECT id FROM posts WHERE site_id = ${siteId})`],
      ["campaign_items", sql`UPDATE campaign_items SET user_id = ${to} WHERE user_id = ${from} AND campaign_id IN (SELECT id FROM campaigns WHERE site_id = ${siteId})`],
      ["generation_logs", sql`UPDATE generation_logs SET user_id = ${to} WHERE user_id = ${from} AND post_id IN (SELECT id FROM posts WHERE site_id = ${siteId})`],
      ["image_assets", sql`UPDATE image_assets SET user_id = ${to} WHERE user_id = ${from} AND (post_id IN (SELECT id FROM posts WHERE site_id = ${siteId}) OR job_id IN (SELECT id FROM jobs WHERE site_id = ${siteId}))`],
      ["image_generation_requests", sql`UPDATE image_generation_requests SET user_id = ${to} WHERE user_id = ${from} AND (post_id IN (SELECT id FROM posts WHERE site_id = ${siteId}) OR job_id IN (SELECT id FROM jobs WHERE site_id = ${siteId}))`],
    ];
    for (const [table, statement] of children) moved[table] = count(await tx.execute(statement));

    for (const [oldId, newId] of Object.entries(personaMap)) {
      for (const table of ["feeds", "campaigns", "posts", "jobs"]) {
        await tx.execute(sql`UPDATE ${sql.identifier(table)} SET persona_id = ${newId}::uuid WHERE site_id = ${siteId} AND persona_id = ${oldId}::uuid`);
      }
    }

    // The previous owner's agent access and preferences must stop pointing at the site.
    await tx.execute(sql`UPDATE mcp_access_tokens SET site_ids = array_remove(site_ids, ${siteId}::uuid) WHERE user_id = ${from} AND ${siteId}::uuid = ANY(site_ids)`);
    await tx.execute(sql`UPDATE mcp_oauth_connections SET site_ids = array_remove(site_ids, ${siteId}::uuid), site_id = CASE WHEN site_id = ${siteId}::uuid THEN NULL ELSE site_id END WHERE user_id = ${from} AND (site_id = ${siteId}::uuid OR ${siteId}::uuid = ANY(site_ids))`);
    await tx.execute(sql`UPDATE user_settings SET site_id = CASE WHEN site_id = ${siteId}::uuid THEN NULL ELSE site_id END, active_site_id = CASE WHEN active_site_id = ${siteId}::uuid THEN NULL ELSE active_site_id END WHERE user_id = ${from}`);

    await tx.update(sites).set({ userId: to, updatedAt: new Date() }).where(and(eq(sites.id, siteId), eq(sites.userId, from)));

    const details = { siteId, siteName: site.name, domain: site.domain, fromUserId: from, toUserId: to, toEmail: target.email, moved, personasCopied: Object.keys(personaMap).length };
    await tx.insert(adminAuditEvents).values([
      { adminUserId: adminId, targetUserId: from, action: "transfer_site_out", reason, details },
      { adminUserId: adminId, targetUserId: to, action: "transfer_site_in", reason, details },
    ]);
    return { ok: true, details };
  });
}
