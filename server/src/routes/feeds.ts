import { Hono } from "hono";
import { db } from "../db/index.js";
import { feeds, posts } from "../db/schema.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";

export const feedsRoutes = new Hono();

feedsRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select()
    .from(feeds)
    .where(eq(feeds.userId, userId))
    .orderBy(desc(feeds.createdAt));
  return c.json(rows);
});

feedsRoutes.post("/", async (c) => {
  const userId = getUserId(c);
  const body = await c.req.json();
  const [feed] = await db
    .insert(feeds)
    .values({ ...body, userId })
    .returning();
  return c.json(feed, 201);
});

feedsRoutes.put("/:id", async (c) => {
  const userId = getUserId(c);
  const id = c.req.param("id");
  const body = await c.req.json();

  const [updated] = await db
    .update(feeds)
    .set(body)
    .where(and(eq(feeds.id, id), eq(feeds.userId, userId)))
    .returning();

  if (!updated) return c.json({ error: "Feed not found" }, 404);
  return c.json(updated);
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
