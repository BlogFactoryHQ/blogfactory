import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { indexingIntegrations, sites } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import {
  encryptIndexingCredentials,
  getIndexingDashboard,
  type IndexingProvider,
  isIndexingProvider,
  serializeIndexingIntegration,
  submitUrlsForSite,
  testIndexingIntegration,
} from "../services/indexing.js";

export const indexingRoutes = new Hono();

indexingRoutes.get("/dashboard", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json(await getIndexingDashboard(userId, siteId));
});

indexingRoutes.post("/integrations", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const provider = String(body.provider || "");
  const siteId = String(body.siteId || body.site_id || "");

  if (!isIndexingProvider(provider)) return c.json({ error: "Unsupported indexing provider" }, 400);
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);

  try {
    const [existing] = await db
      .select({ id: indexingIntegrations.id })
      .from(indexingIntegrations)
      .where(and(eq(indexingIntegrations.userId, userId), eq(indexingIntegrations.siteId, siteId), eq(indexingIntegrations.provider, provider)))
      .limit(1);
    if (existing) return c.json({ error: `${defaultDisplayName(provider)} is already connected for this site` }, 409);

    const { encrypted, hint } = encryptIndexingCredentials(provider, body.credentials);
    const [created] = await db
      .insert(indexingIntegrations)
      .values({
        userId,
        siteId,
        provider,
        displayName: String(body.displayName || body.display_name || defaultDisplayName(provider)),
        status: "connected",
        autoSubmit: body.autoSubmit ?? body.auto_submit ?? true,
        credentialsEncrypted: encrypted,
        credentialHint: hint,
        config: sanitizeConfig(body.config),
      })
      .returning();
    return c.json({ integration: serializeIndexingIntegration(created) }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to create indexing integration" }, 400);
  }
});

indexingRoutes.put("/integrations/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json();

  const [existing] = await db
    .select()
    .from(indexingIntegrations)
    .where(and(eq(indexingIntegrations.id, id), eq(indexingIntegrations.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "Integration not found" }, 404);

  try {
    const hasCredentials = Boolean(body.credentials) && Object.values(body.credentials || {}).some(Boolean);
    const credentials = hasCredentials ? encryptIndexingCredentials(existing.provider as IndexingProvider, body.credentials) : null;
    const [updated] = await db
      .update(indexingIntegrations)
      .set({
        displayName: String(body.displayName || body.display_name || existing.displayName),
        autoSubmit: body.autoSubmit ?? body.auto_submit ?? existing.autoSubmit,
        ...(credentials ? { credentialsEncrypted: credentials.encrypted, credentialHint: credentials.hint } : {}),
        config: sanitizeConfig(body.config ?? existing.config),
        status: "connected",
      })
      .where(and(eq(indexingIntegrations.id, id), eq(indexingIntegrations.userId, userId)))
      .returning();
    return c.json({ integration: serializeIndexingIntegration(updated) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to update indexing integration" }, 400);
  }
});

indexingRoutes.post("/integrations/:id/test", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [integration] = await db
    .select()
    .from(indexingIntegrations)
    .where(and(eq(indexingIntegrations.id, id), eq(indexingIntegrations.userId, userId)))
    .limit(1);
  if (!integration) return c.json({ error: "Integration not found" }, 404);

  try {
    const result = await testIndexingIntegration(integration);
    const [updated] = await db
      .update(indexingIntegrations)
      .set({ status: "connected", lastTestedAt: new Date(), lastTestResult: result.message || "Connected" })
      .where(eq(indexingIntegrations.id, integration.id))
      .returning();
    return c.json({ success: true, message: result.message, integration: serializeIndexingIntegration(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed";
    const [updated] = await db
      .update(indexingIntegrations)
      .set({ status: "error", lastTestedAt: new Date(), lastTestResult: message })
      .where(eq(indexingIntegrations.id, integration.id))
      .returning();
    return c.json({ success: false, error: message, integration: serializeIndexingIntegration(updated) }, 400);
  }
});

indexingRoutes.delete("/integrations/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [deleted] = await db
    .delete(indexingIntegrations)
    .where(and(eq(indexingIntegrations.id, id), eq(indexingIntegrations.userId, userId)))
    .returning({ id: indexingIntegrations.id });
  if (!deleted) return c.json({ error: "Integration not found" }, 404);
  return c.json({ success: true });
});

indexingRoutes.post("/submit", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  const urls = Array.isArray(body.urls)
    ? body.urls
    : String(body.urls || "")
      .split(/\r?\n/)
      .map((url) => url.trim())
      .filter(Boolean);

  try {
    return c.json(await submitUrlsForSite(userId, siteId, urls, "manual"));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Submission failed" }, 400);
  }
});

async function hasSiteAccess(userId: string, siteId: string) {
  if (!siteId) return false;
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1);
  return Boolean(site);
}

function sanitizeConfig(value: unknown) {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function defaultDisplayName(provider: string) {
  return provider === "google" ? "Google" : "IndexNow";
}
