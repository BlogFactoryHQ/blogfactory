import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { searchConsoleIntegrations } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import {
  completeSearchConsoleOAuth,
  createSearchConsoleOAuthUrl,
  encryptSearchConsoleCredentials,
  getSearchConsoleDashboard,
  hasSiteAccess,
  normalizeSearchConsoleProperty,
  serializeSearchConsoleIntegration,
  syncSearchConsoleMetrics,
  testSearchConsoleIntegration,
} from "../services/search-console.js";
import { refreshOptimizePages } from "../services/optimize.js";
import { completeGoogleIndexingOAuth, isGoogleIndexingOAuthState } from "../services/indexing.js";

export const searchConsoleRoutes = new Hono();

searchConsoleRoutes.get("/oauth/start", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);

  try {
    const authUrl = await createSearchConsoleOAuthUrl({
      userId,
      siteId,
      propertyUrl: String(c.req.query("propertyUrl") || ""),
      requestUrl: c.req.url,
    });
    return c.json({ authUrl });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to start Google OAuth" }, 400);
  }
});

searchConsoleRoutes.get("/oauth/callback", async (c) => {
  const state = String(c.req.query("state") || "");
  const isIndexing = await isGoogleIndexingOAuthState(state);
  const appPath = isIndexing ? "/search-growth?tab=indexing" : "/search-growth?tab=optimize";
  const error = c.req.query("error");
  const resultKey = isIndexing ? "indexing" : "gsc";
  if (error) return c.redirect(`${appPath}&${resultKey}=error&message=${encodeURIComponent(error)}`);

  try {
    const input = { code: String(c.req.query("code") || ""), state, requestUrl: c.req.url };
    if (isIndexing) {
      await completeGoogleIndexingOAuth(input);
    } else {
      await completeSearchConsoleOAuth(input);
    }
    return c.redirect(`${appPath}&${resultKey}=connected`);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Google OAuth failed";
    return c.redirect(`${appPath}&${resultKey}=error&message=${encodeURIComponent(message)}`);
  }
});

searchConsoleRoutes.get("/dashboard", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json(await getSearchConsoleDashboard(userId, siteId));
});

searchConsoleRoutes.post("/integrations", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);

  try {
    const { encrypted, hint } = encryptSearchConsoleCredentials(body.credentials);
    const [created] = await db
      .insert(searchConsoleIntegrations)
      .values({
        userId,
        siteId,
        propertyUrl: normalizeSearchConsoleProperty(String(body.propertyUrl || body.property_url || "")),
        status: "connected",
        credentialsEncrypted: encrypted,
        credentialHint: hint,
      })
      .returning();
    return c.json({ integration: serializeSearchConsoleIntegration(created) }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to connect Search Console" }, 400);
  }
});

searchConsoleRoutes.put("/integrations/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json();
  const [existing] = await db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.id, id), eq(searchConsoleIntegrations.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "Integration not found" }, 404);

  try {
    const hasCredentials = Boolean(body.credentials) && Object.values(body.credentials || {}).some(Boolean);
    const credentials = hasCredentials ? encryptSearchConsoleCredentials(body.credentials) : null;
    const [updated] = await db
      .update(searchConsoleIntegrations)
      .set({
        propertyUrl: normalizeSearchConsoleProperty(String(body.propertyUrl || body.property_url || existing.propertyUrl)),
        ...(credentials ? { credentialsEncrypted: credentials.encrypted, credentialHint: credentials.hint } : {}),
        status: "connected",
      })
      .where(and(eq(searchConsoleIntegrations.id, id), eq(searchConsoleIntegrations.userId, userId)))
      .returning();
    return c.json({ integration: serializeSearchConsoleIntegration(updated) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to update Search Console" }, 400);
  }
});

searchConsoleRoutes.post("/integrations/:id/test", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [integration] = await db
    .select()
    .from(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.id, id), eq(searchConsoleIntegrations.userId, userId)))
    .limit(1);
  if (!integration) return c.json({ error: "Integration not found" }, 404);

  try {
    const result = await testSearchConsoleIntegration(integration);
    const [updated] = await db
      .update(searchConsoleIntegrations)
      .set({ status: "connected", lastTestedAt: new Date(), lastTestResult: result.message })
      .where(eq(searchConsoleIntegrations.id, integration.id))
      .returning();
    return c.json({ success: true, message: result.message, integration: serializeSearchConsoleIntegration(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed";
    const [updated] = await db
      .update(searchConsoleIntegrations)
      .set({ status: "error", lastTestedAt: new Date(), lastTestResult: message })
      .where(eq(searchConsoleIntegrations.id, integration.id))
      .returning();
    return c.json({ success: false, error: message, integration: serializeSearchConsoleIntegration(updated) }, 400);
  }
});

searchConsoleRoutes.delete("/integrations/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [deleted] = await db
    .delete(searchConsoleIntegrations)
    .where(and(eq(searchConsoleIntegrations.id, id), eq(searchConsoleIntegrations.userId, userId)))
    .returning({ id: searchConsoleIntegrations.id });
  if (!deleted) return c.json({ error: "Integration not found" }, 404);
  return c.json({ success: true });
});

searchConsoleRoutes.post("/sync", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);

  try {
    const synced = await syncSearchConsoleMetrics(userId, siteId);
    const refreshed = await refreshOptimizePages(userId, siteId);
    return c.json({ ...synced, optimizePages: refreshed.updated });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Search Console sync failed" }, 400);
  }
});
