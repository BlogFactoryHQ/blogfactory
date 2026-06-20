import { Hono } from "hono";
import { db } from "../db/index.js";
import { schedulerLogs } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";
import { getUserId } from "../middleware/auth.js";

export const schedulerRoutes = new Hono();

schedulerRoutes.get("/logs", async (c) => {
  const userId = getUserId(c);
  const rows = await db
    .select()
    .from(schedulerLogs)
    .where(eq(schedulerLogs.userId, userId))
    .orderBy(desc(schedulerLogs.triggeredAt))
    .limit(50);
  return c.json(rows);
});

schedulerRoutes.post("/run", async (c) => {
  const userId = getUserId(c);
  const { runScheduler } = await import("../services/scheduler.js");
  const result = await runScheduler(userId);
  return c.json(result);
});
