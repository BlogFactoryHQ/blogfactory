import { Hono } from "hono";
import { db } from "../db/index.js";
import { feeds } from "../db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";

export const feedsRoutes = new Hono();

function feedValues(body: Record<string, any>) {
  const value = (snake: string, camel = snake.replace(/_([a-z])/g, (_, char) => char.toUpperCase())) => body[camel] ?? body[snake];
  const values: Record<string, any> = {};
  const set = (key: string, snake: string) => {
    const next = value(snake);
    if (next !== undefined) values[key] = next;
  };

  set("name", "name");
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

function serializeFeed(row: typeof feeds.$inferSelect) {
  return {
    ...row,
    user_id: row.userId,
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
    .select()
    .from(feeds)
    .where(eq(feeds.userId, userId))
    .orderBy(desc(feeds.createdAt));
  return c.json(rows.map(serializeFeed));
});

feedsRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const values = feedValues(body);
  if (!values.name) return c.json({ error: "Feed name is required" }, 400);
  const [feed] = await db
    .insert(feeds)
    .values({ ...values, userId, name: values.name })
    .returning();
  return c.json(serializeFeed(feed), 201);
});

feedsRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json();

  const [updated] = await db
    .update(feeds)
    .set(feedValues(body))
    .where(and(eq(feeds.id, id), eq(feeds.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: "Feed not found" }, 404);
  return c.json(serializeFeed(updated));
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
