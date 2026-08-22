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
  getSearchConsoleInsights,
  hasSiteAccess,
  inspectSearchConsoleUrl,
  inspectSearchConsoleUrls,
  listSearchConsoleProperties,
  listSearchConsoleSitemaps,
  normalizeSearchConsoleProperty,
  querySearchConsoleAnalytics,
  refreshSearchConsoleData,
  selectSearchConsoleProperty,
  serializeSearchConsoleIntegration,
  testSearchConsoleIntegration,
} from "../services/search-console.js";
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
      propertyUrl: c.req.query("propertyUrl") || undefined,
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
      const integration = await completeSearchConsoleOAuth(input);
      if (integration.status === "property_selection_required") {
        return c.redirect(`${appPath}&gsc=select`);
      }
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

searchConsoleRoutes.get("/insights", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json(await getSearchConsoleInsights(userId, siteId));
});

searchConsoleRoutes.get("/properties", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  try {
    return c.json(await listSearchConsoleProperties(userId, siteId));
  } catch (error) {
    return c.json(searchConsoleError(error, "Failed to load Search Console properties"), 400);
  }
});

searchConsoleRoutes.post("/property", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  try {
    return c.json({ integration: await selectSearchConsoleProperty(userId, siteId, String(body.propertyUrl || body.property_url || "")) });
  } catch (error) {
    return c.json(searchConsoleError(error, "Failed to select Search Console property"), 400);
  }
});

searchConsoleRoutes.post("/inspect", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  try {
    return c.json(await inspectSearchConsoleUrl(userId, siteId, String(body.url || ""), Boolean(body.force)));
  } catch (error) {
    return c.json(searchConsoleError(error, "URL inspection failed"), 400);
  }
});

searchConsoleRoutes.post("/inspect/batch", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  try {
    return c.json(await inspectSearchConsoleUrls(userId, siteId, Array.isArray(body.urls) ? body.urls.map(String) : [], Boolean(body.force)));
  } catch (error) {
    return c.json(searchConsoleError(error, "Batch URL inspection failed"), 400);
  }
});

searchConsoleRoutes.get("/sitemaps", async (c) => {
  const userId = getUserId(c);
  const siteId = String(c.req.query("siteId") || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  try {
    return c.json(await listSearchConsoleSitemaps(userId, siteId, c.req.query("sitemapIndex")));
  } catch (error) {
    return c.json(searchConsoleError(error, "Failed to load sitemaps"), 400);
  }
});

searchConsoleRoutes.post("/analytics/query", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  try {
    return c.json(await querySearchConsoleAnalytics(userId, siteId, {
      range: Number(body.range || 28) as 7 | 28 | 90,
      compare: body.compare !== false,
      groupBy: String(body.groupBy || "query") as "page" | "query" | "country" | "device",
      searchType: String(body.searchType || "web") as "web" | "image" | "video" | "news",
      country: body.country ? String(body.country) : undefined,
      device: body.device ? String(body.device).toUpperCase() as "DESKTOP" | "MOBILE" | "TABLET" : undefined,
      limit: Number(body.limit || 50),
      includePreliminary: Boolean(body.includePreliminary ?? body.include_preliminary),
    }));
  } catch (error) {
    return c.json(searchConsoleError(error, "Search Console analytics query failed"), 400);
  }
});

searchConsoleRoutes.post("/integrations", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const siteId = String(body.siteId || body.site_id || "");
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);

  try {
    const { encrypted, hint } = encryptSearchConsoleCredentials(body.credentials);
    const propertyUrl = normalizeSearchConsoleProperty(String(body.propertyUrl || body.property_url || ""));
    await testSearchConsoleIntegration({ propertyUrl, credentialsEncrypted: encrypted, credentialHint: hint });
    const [created] = await db
      .insert(searchConsoleIntegrations)
      .values({
        userId,
        siteId,
        propertyUrl,
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
    const propertyUrl = normalizeSearchConsoleProperty(String(body.propertyUrl || body.property_url || existing.propertyUrl));
    await testSearchConsoleIntegration({
      propertyUrl,
      credentialsEncrypted: credentials?.encrypted || existing.credentialsEncrypted,
      credentialHint: credentials?.hint || existing.credentialHint,
    });
    const [updated] = await db
      .update(searchConsoleIntegrations)
      .set({
        propertyUrl,
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
    return c.json(await refreshSearchConsoleData(userId, siteId));
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Search Console sync failed" }, 400);
  }
});

function searchConsoleError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const lower = message.toLowerCase();
  const code = lower.includes("connect search console")
    ? "connection_required"
    : lower.includes("choose a search console property")
      ? "property_selection_required"
      : lower.includes("permission denied") || lower.includes("cannot access")
        ? "permission_denied"
        : lower.includes("quota exceeded")
          ? "quota_exceeded"
          : lower.includes("timeout") || lower.includes("aborted")
            ? "provider_timeout"
            : "invalid_request";
  return { error: message, code };
}
