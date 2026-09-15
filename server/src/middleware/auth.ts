import { Context, Next } from "hono";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { bootstrapUserAccess, isApproved } from "../services/access-control.js";
import { isPlaceholderValue } from "../config/runtime.js";
import { authenticateWorkosSession } from "../services/workos-auth.js";

export function resolveJwtSecret(value = process.env.JWT_SECRET, environment = process.env.NODE_ENV) {
  if (environment === "production" && isPlaceholderValue(value)) {
    throw new Error("JWT_SECRET must be configured in production");
  }
  return value || "dev-secret";
}

const JWT_SECRET = new TextEncoder().encode(resolveJwtSecret());

export interface AuthContext {
  userId: string;
}

const PUBLIC_AUTH_PATHS = new Set([
  "/api/auth/config",
  "/api/auth/dev-login",
  "/api/auth/signup",
  "/api/auth/login",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/resend-verification",
  "/api/auth/google",
  "/api/auth/workos/start",
  "/api/auth/workos/callback",
]);

async function authorizeUser(c: Context, next: Next, user: { id: string; role: string; approvalStatus: string }) {
  c.set("userId", user.id);
  c.set("userRole", user.role);
  c.set("approvalStatus", user.approvalStatus);
  if (c.req.path.startsWith("/api/admin/") && user.role !== "admin") return c.json({ error: "Admin access required" }, 403);
  const pendingAllowed = c.req.path === "/api/auth/me" || c.req.path === "/api/settings/api-keys";
  if (!isApproved(user.role, user.approvalStatus) && !pendingAllowed) return c.json({ error: "Account approval required", approvalStatus: user.approvalStatus }, 403);
  return next();
}

export async function authMiddleware(c: Context, next: Next) {
  const path = c.req.path;

  // Public routes that skip auth
  if (
    path === "/api/health" ||
    path === "/api/ready" ||
    path.startsWith("/api/cron/") ||
    PUBLIC_AUTH_PATHS.has(path) ||
    path === "/api/search-console/oauth/callback" ||
    path.startsWith("/api/storage/") ||
    path.startsWith("/api/webhooks/")
  ) {
    return next();
  }

  const workosUser = await authenticateWorkosSession(c).catch(() => null);
  if (workosUser) return authorizeUser(c, next, workosUser);
  if (process.env.BLOGFACTORY_CLOUD === "true") return c.json({ error: "Authorization required" }, 401);

  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Authorization required" }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userId = payload.sub as string;
    const [rawUser] = await db
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        approvalStatus: users.approvalStatus,
        sessionVersion: users.sessionVersion,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!rawUser) return c.json({ error: "User not found" }, 401);
    if (Number(payload.session_version ?? -1) !== rawUser.sessionVersion) return c.json({ error: "Invalid or expired token" }, 401);

    return authorizeUser(c, next, await bootstrapUserAccess(rawUser));
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

export function getUserId(c: Context): string {
  return c.get("userId") as string;
}

export async function signJwt(userId: string, rememberMe = false): Promise<string> {
  const { SignJWT } = await import("jose");
  const [user] = await db.select({ sessionVersion: users.sessionVersion }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new Error("User not found");
  return new SignJWT({ sub: userId, session_version: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(rememberMe ? "30d" : "7d")
    .sign(JWT_SECRET);
}
