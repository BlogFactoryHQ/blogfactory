import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { feeds, siteIntegrations, sites } from "../db/schema.js";
import { getUserId } from "../middleware/auth.js";
import {
  encryptProviderCredentials,
  getGhostAuthors,
  isPublishingProvider,
  listUserIntegrations,
  serializeIntegration,
  testIntegration,
} from "../services/publishing.js";
import { readJsonObject, requiredString } from "../http/error-contract.js";

export const integrationsRoutes = new Hono();

integrationsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const siteId = c.req.query("siteId") || undefined;
  if (siteId && !(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);
  return c.json({ integrations: await listUserIntegrations(userId, siteId) });
});

integrationsRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);
  const provider = requiredString(body, "provider");
  const siteId = requiredString(body, "siteId", ["site_id"]);

  if (!isPublishingProvider(provider)) return c.json({ error: "Unsupported integration provider" }, 400);
  if (!(await hasSiteAccess(userId, siteId))) return c.json({ error: "Site not found" }, 404);

  try {
    const { encrypted, hint } = encryptProviderCredentials(provider, body.credentials);
    const [created] = await db
      .insert(siteIntegrations)
      .values({
        userId,
        siteId,
        provider,
        displayName: String(body.displayName || body.display_name || defaultDisplayName(provider)),
        status: "pending",
        credentialsEncrypted: encrypted,
        credentialHint: hint,
        config: sanitizeConfig(body.config),
      })
      .returning();
    return c.json({ integration: serializeIntegration(created) }, 201);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to create integration" }, 400);
  }
});

integrationsRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await readJsonObject(c);

  const [existing] = await db
    .select()
    .from(siteIntegrations)
    .where(and(eq(siteIntegrations.id, id), eq(siteIntegrations.userId, userId)))
    .limit(1);
  if (!existing) return c.json({ error: "Integration not found" }, 404);

  try {
    const provider = existing.provider as "wordpress" | "ghost" | "wix" | "framer";
    const credentials = body.credentials
      ? encryptProviderCredentials(provider, body.credentials, existing)
      : null;
    const [updated] = await db
      .update(siteIntegrations)
      .set({
        displayName: String(body.displayName || body.display_name || existing.displayName),
        ...(credentials ? { credentialsEncrypted: credentials.encrypted, credentialHint: credentials.hint } : {}),
        config: sanitizeConfig(body.config ?? existing.config),
        status: "pending",
        lastTestedAt: null,
        lastTestResult: null,
      })
      .where(and(eq(siteIntegrations.id, id), eq(siteIntegrations.userId, userId)))
      .returning();
    return c.json({ integration: serializeIntegration(updated) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Failed to update integration" }, 400);
  }
});

integrationsRoutes.post("/:id/test", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [integration] = await db
    .select()
    .from(siteIntegrations)
    .where(and(eq(siteIntegrations.id, id), eq(siteIntegrations.userId, userId)))
    .limit(1);
  if (!integration) return c.json({ error: "Integration not found" }, 404);

  try {
    const result = await testIntegration(integration);
    const [updated] = await db
      .update(siteIntegrations)
      .set({ status: "connected", lastTestedAt: new Date(), lastTestResult: result.message || "Connected" })
      .where(eq(siteIntegrations.id, integration.id))
      .returning();
    return c.json({ success: true, message: result.message, integration: serializeIntegration(updated) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Connection test failed";
    const [updated] = await db
      .update(siteIntegrations)
      .set({ status: "error", lastTestedAt: new Date(), lastTestResult: message })
      .where(eq(siteIntegrations.id, integration.id))
      .returning();
    return c.json({ success: false, error: message, integration: serializeIntegration(updated) }, 400);
  }
});

integrationsRoutes.get("/:id/authors", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const [integration] = await db
    .select()
    .from(siteIntegrations)
    .where(and(eq(siteIntegrations.id, id), eq(siteIntegrations.userId, userId)))
    .limit(1);
  if (!integration) return c.json({ error: "Integration not found" }, 404);
  if (integration.provider !== "ghost") return c.json({ error: "Authors are only available for Ghost integrations" }, 400);

  try {
    return c.json({ authors: await getGhostAuthors(integration) });
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Ghost authors could not be loaded" }, 502);
  }
});

integrationsRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  await db.update(feeds).set({ isActive: false, integrationId: null }).where(and(eq(feeds.integrationId, id), eq(feeds.userId, userId)));
  const [deleted] = await db
    .delete(siteIntegrations)
    .where(and(eq(siteIntegrations.id, id), eq(siteIntegrations.userId, userId)))
    .returning({ id: siteIntegrations.id });
  if (!deleted) return c.json({ error: "Integration not found" }, 404);
  return c.json({ success: true });
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
  if (provider === "wordpress") return "WordPress";
  if (provider === "ghost") return "Ghost";
  if (provider === "wix") return "Wix";
  return "Framer";
}
