import type { MiddlewareHandler } from "hono";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs, posts, sites } from "../db/schema.js";
import { finishOperationEvent, safeOperationMetadata, startOperationEvent } from "../services/operation-events.js";
import { getGlobalSettings } from "../services/user-settings.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function operationTarget(path: string) {
  const parts = path.split("/").filter(Boolean).slice(1);
  const objectId = parts.find((part) => UUID.test(part)) || null;
  return {
    objectType: parts[0]?.replace(/[^a-z0-9_-]/gi, "_").slice(0, 80) || null,
    objectId,
    action: parts.map((part) => UUID.test(part) ? ":id" : part).join("/").slice(0, 140),
  };
}

async function operationSiteId(userId: string, target: ReturnType<typeof operationTarget>) {
  if (target.objectId && target.objectType === "posts") {
    const [post] = await db.select({ siteId: posts.siteId }).from(posts).where(and(eq(posts.id, target.objectId), eq(posts.userId, userId))).limit(1);
    if (post?.siteId) return post.siteId;
  }
  if (target.objectId && target.objectType === "jobs") {
    const [job] = await db.select({ siteId: jobs.siteId }).from(jobs).where(and(eq(jobs.id, target.objectId), eq(jobs.userId, userId))).limit(1);
    if (job?.siteId) return job.siteId;
  }
  if (target.objectId && target.objectType === "sites") {
    const [site] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, target.objectId), eq(sites.userId, userId))).limit(1);
    if (site) return site.id;
  }
  const activeSiteId = (await getGlobalSettings(userId))?.activeSiteId;
  if (!activeSiteId) return null;
  const [activeSite] = await db.select({ id: sites.id }).from(sites).where(and(eq(sites.id, activeSiteId), eq(sites.userId, userId))).limit(1);
  return activeSite?.id || null;
}

export const operationLedgerMiddleware: MiddlewareHandler = async (c, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method)) return next();
  const userId = c.get("userId") as string | undefined;
  if (!userId || c.req.path.startsWith("/api/cron/") || c.req.path.startsWith("/api/webhooks/")) return next();
  const startedAt = Date.now();
  const target = operationTarget(c.req.path);
  const siteId = await operationSiteId(userId, target);
  const eventId = await startOperationEvent({
    userId,
    siteId,
    origin: "web",
    clientName: "BlogFactory web",
    action: `${c.req.method} ${target.action}`,
    objectType: target.objectType,
    objectId: target.objectId,
    metadata: safeOperationMetadata(target.action, {}),
  });
  try {
    await next();
    await finishOperationEvent({
      id: eventId,
      status: c.res.status < 400 ? "succeeded" : "failed",
      durationMs: Date.now() - startedAt,
      errorCode: c.res.status < 400 ? null : `http_${c.res.status}`,
    });
  } catch (error) {
    await finishOperationEvent({ id: eventId, status: "failed", durationMs: Date.now() - startedAt, errorCode: "unhandled_error" });
    throw error;
  }
};
