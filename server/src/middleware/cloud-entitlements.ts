import type { Context, Next } from "hono";
import { getUserId } from "./auth.js";
import { getCloudAccess } from "../services/cloud-entitlements.js";

const ALLOWED_MUTATION_PREFIXES = ["/api/billing/", "/api/auth/", "/api/webhooks/", "/api/cron/", "/api/admin/"];

export async function cloudEntitlementMiddleware(c: Context, next: Next) {
  if (["GET", "HEAD", "OPTIONS"].includes(c.req.method) || ALLOWED_MUTATION_PREFIXES.some((path) => c.req.path.startsWith(path))) return next();
  const userId = getUserId(c);
  if (!userId) return next();
  const access = await getCloudAccess(userId);
  if (!access.allowed) return c.json({
    error: "An active BlogFactory Cloud plan is required for this action",
    code: access.reason,
    message: "An active BlogFactory Cloud plan is required for this action",
    billing_url: "/billing",
  }, 403);
  return next();
}
