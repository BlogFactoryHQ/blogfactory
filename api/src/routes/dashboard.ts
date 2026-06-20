import { Hono } from "hono";
import { db } from "../db/index.js";
import { posts, jobs, feeds, generationLogs } from "../db/schema.js";
import { eq, and, sql, gte, count } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";

export const dashboardRoutes = new Hono();

dashboardRoutes.get("/stats", async (c) => {
  const userId = getUserId(c);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [postCount] = await db
    .select({ count: count() })
    .from(posts)
    .where(eq(posts.userId, userId));

  const [draftCount] = await db
    .select({ count: count() })
    .from(posts)
    .where(and(eq(posts.userId, userId), eq(posts.status, "draft")));

  const [publishedCount] = await db
    .select({ count: count() })
    .from(posts)
    .where(and(eq(posts.userId, userId), eq(posts.status, "published")));

  const [jobCount] = await db
    .select({ count: count() })
    .from(jobs)
    .where(eq(jobs.userId, userId));

  const [activeFeedCount] = await db
    .select({ count: count() })
    .from(feeds)
    .where(and(eq(feeds.userId, userId), eq(feeds.isActive, true)));

  const [costResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(cost), 0)` })
    .from(generationLogs)
    .where(
      and(eq(generationLogs.userId, userId), gte(generationLogs.createdAt, thirtyDaysAgo))
    );

  return c.json({
    totalPosts: postCount.count,
    drafts: draftCount.count,
    published: publishedCount.count,
    totalJobs: jobCount.count,
    activeFeeds: activeFeedCount.count,
    monthCost: costResult.total,
  });
});
