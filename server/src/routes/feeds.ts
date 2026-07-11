import { Hono } from "hono";
import { db } from "../db/index.js";
import { feeds, siteIntegrations, sites } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";
import { inspectFeedRouting } from "../services/feed-routing.js";
import { readJsonObject, requiredString } from "../http/error-contract.js";

export const feedsRoutes = new Hono();

function feedValues(body: Record<string, unknown>) {
  const value = (snake: string, camel = snake.replace(/_([a-z])/g, (_, char) => char.toUpperCase())) => body[camel] ?? body[snake];
  const values: Record<string, any> = {};
  const set = (key: string, snake: string) => {
    const next = value(snake);
    if (next !== undefined) values[key] = next;
  };

  set("name", "name");
  set("siteId", "site_id");
  set("integrationId", "integration_id");
  set("editorialDefaults", "editorial_defaults");
  set("routingVersion", "routing_version");
  set("sourceUrl", "source_url");
  set("platform", "platform");
  set("platformConfig", "platform_config");
  set("modelId", "model_id");
  set("personaId", "persona_id");
  set("frequency", "frequency");
  set("filterType", "filter_type");
  set("filterValue", "filter_value");
  set("filterOldPostsDays", "filter_old_posts_days");
  set("keywords", "keywords");
  set("postsPerRun", "posts_per_run");
  set("isActive", "is_active");
  set("autoContinue", "auto_continue");
  set("blurNsfw", "blur_nsfw");
  set("includeContent", "include_content");
  set("includeSummary", "include_summary");
  set("includeComments", "include_comments");
  set("extractFullContent", "extract_full_content");
  values.updatedAt = new Date();
  return values;
}

function serializeFeed(row: typeof feeds.$inferSelect, route?: { siteName?: string | null; integrationName?: string | null; provider?: string | null; integrationConfig?: unknown; ready?: boolean }) {
  const routeReady = route?.ready ?? Boolean(row.siteId && row.integrationId);
  const { runClaimToken: _runClaimToken, runLeaseUntil: _runLeaseUntil, runActiveCount: _runActiveCount, ...publicRow } = row;
  return {
    ...publicRow,
    user_id: row.userId,
    site_id: row.siteId,
    integration_id: row.integrationId,
    editorial_defaults: row.editorialDefaults || {},
    routing_version: row.routingVersion,
    routing_status: routeReady ? "ready" : "needs_routing",
    site_name: route?.siteName || null,
    integration_name: route?.integrationName || null,
    integration_provider: route?.provider || null,
    integration_config: route?.integrationConfig || {},
    source_url: row.sourceUrl,
    platform_config: row.platformConfig,
    model_id: row.modelId,
    persona_id: row.personaId,
    filter_type: row.filterType,
    filter_value: row.filterValue,
    filter_old_posts_days: row.filterOldPostsDays,
    posts_per_run: row.postsPerRun,
    is_active: row.isActive,
    auto_continue: row.autoContinue,
    blur_nsfw: row.blurNsfw,
    include_content: row.includeContent,
    include_summary: row.includeSummary,
    include_comments: row.includeComments,
    extract_full_content: row.extractFullContent,
    last_run_at: row.lastRunAt,
    total_articles: row.totalArticles,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

feedsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select({ feed: feeds, siteName: sites.name, integrationName: siteIntegrations.displayName, provider: siteIntegrations.provider, integrationStatus: siteIntegrations.status, integrationSiteId: siteIntegrations.siteId, integrationConfig: siteIntegrations.config })
    .from(feeds)
    .leftJoin(sites, and(eq(feeds.siteId, sites.id), eq(sites.userId, userId)))
    .leftJoin(siteIntegrations, and(eq(feeds.integrationId, siteIntegrations.id), eq(siteIntegrations.userId, userId)))
    .where(eq(feeds.userId, userId))
    .orderBy(desc(feeds.createdAt));
  return c.json(rows.map((row) => {
    const config = row.integrationConfig && typeof row.integrationConfig === "object" ? row.integrationConfig as Record<string, unknown> : {};
    const defaults = row.feed.editorialDefaults && typeof row.feed.editorialDefaults === "object" ? row.feed.editorialDefaults as Record<string, unknown> : {};
    const ortakAlan = config.profile === "ortak_alan_news";
    const author = config.defaultAuthor && typeof config.defaultAuthor === "object" ? config.defaultAuthor as Record<string, unknown> : {};
    const ready = Boolean(row.feed.siteId && row.feed.integrationId && row.integrationSiteId === row.feed.siteId && row.integrationStatus === "connected" && (!ortakAlan || (defaults.contentType && author.id && config.editorialOwner)));
    return serializeFeed(row.feed, { ...row, ready });
  }));
});

feedsRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  const body = await readJsonObject(c);
  const values = feedValues(body);
  values.name = requiredString(body, "name");
  const route = await inspectFeedRouting(userId, values.siteId || null, values.integrationId || null, values.editorialDefaults);
  values.siteId = route.site?.id || null;
  values.integrationId = route.integration?.siteId === route.site?.id ? route.integration.id : null;
  values.editorialDefaults = route.editorialDefaults;
  values.routingVersion = 1;
  if (!route.valid) values.isActive = false;
  const [feed] = await db
    .insert(feeds)
    .values({ ...values, userId, name: values.name })
    .returning();
  return c.json({ ...serializeFeed(feed, { ready: route.valid }), routing_errors: route.errors }, 201);
});

feedsRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await readJsonObject(c);
  const existing = await db.select().from(feeds).where(and(eq(feeds.id, id), eq(feeds.userId, userId))).limit(1);
  if (!existing[0]) return c.json({ error: "Feed not found" }, 404);
  const values = feedValues(body);
  const hasSubmittedRouteFields = body.siteId !== undefined || body.site_id !== undefined || body.integrationId !== undefined || body.integration_id !== undefined || body.editorialDefaults !== undefined || body.editorial_defaults !== undefined;
  const submittedRoutingVersion = Number(body.routingVersion ?? body.routing_version ?? 0);
  const routeFieldsSubmitted = existing[0].routingVersion > 0
    ? hasSubmittedRouteFields
    : submittedRoutingVersion > 0 || Boolean(values.integrationId);
  let routeErrors: string[] = [];
  if (routeFieldsSubmitted || existing[0].routingVersion > 0) {
    const route = await inspectFeedRouting(
      userId,
      values.siteId !== undefined ? values.siteId : existing[0].siteId,
      values.integrationId !== undefined ? values.integrationId : existing[0].integrationId,
      values.editorialDefaults !== undefined ? values.editorialDefaults : existing[0].editorialDefaults,
    );
    values.siteId = route.site?.id || null;
    values.integrationId = route.integration?.siteId === route.site?.id ? route.integration.id : null;
    values.editorialDefaults = route.editorialDefaults;
    values.routingVersion = 1;
    routeErrors = route.errors;
    if (!route.valid) values.isActive = false;
  }

  const [updated] = await db
    .update(feeds)
    .set(values)
    .where(and(eq(feeds.id, id), eq(feeds.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: "Feed not found" }, 404);
  return c.json({ ...serializeFeed(updated, { ready: routeErrors.length === 0 && Boolean(updated.siteId && updated.integrationId) }), routing_errors: routeErrors });
});

feedsRoutes.delete("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");

  const [deleted] = await db
    .delete(feeds)
    .where(and(eq(feeds.id, id), eq(feeds.userId, userId)))
    .returning({ id: feeds.id });

  if (!deleted) return c.json({ error: "Feed not found" }, 404);
  return c.json({ success: true });
});
