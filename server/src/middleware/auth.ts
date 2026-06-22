import { Context, Next } from "hono";
import { jwtVerify } from "jose";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { bootstrapUserAccess, isApproved } from "../services/access-control.js";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");

export interface AuthContext {
  userId: string;
}

export async function authMiddleware(c: Context, next: Next) {
  const path = c.req.path;

  // Public routes that skip auth
  if (
    path === "/api/health" ||
    path.startsWith("/api/cron/") ||
    (path.startsWith("/api/auth/") && path !== "/api/auth/me") ||
    path.startsWith("/api/storage/") ||
    path.startsWith("/api/webhooks/")
  ) {
    return next();
  }

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
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!rawUser) return c.json({ error: "User not found" }, 401);

    const user = await bootstrapUserAccess(rawUser);
    c.set("userId", user.id);
    c.set("userRole", user.role);
    c.set("approvalStatus", user.approvalStatus);

    if (path.startsWith("/api/admin/") && user.role !== "admin") {
      return c.json({ error: "Admin access required" }, 403);
    }

    const pendingAllowed =
      path === "/api/auth/me" ||
      path === "/api/settings/api-keys";

    if (!isApproved(user.role, user.approvalStatus) && !pendingAllowed) {
      return c.json({ error: "Account approval required", approvalStatus: user.approvalStatus }, 403);
    }

    return next();
  } catch {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
}

export function getUserId(c: Context): string {
  return c.get("userId") as string;
}

export async function signJwt(userId: string, rememberMe = false): Promise<string> {
  const { SignJWT } = await import("jose");
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(rememberMe ? "30d" : "7d")
    .sign(JWT_SECRET);
}
