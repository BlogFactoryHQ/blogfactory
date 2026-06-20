import { Context, Next } from "hono";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "dev-secret");

export interface AuthContext {
  userId: string;
}

export async function authMiddleware(c: Context, next: Next) {
  const path = c.req.path;

  // Public routes that skip auth
  if (
    path === "/api/health" ||
    (path.startsWith("/api/auth/") && path !== "/api/auth/me") ||
    path.startsWith("/api/models/") ||
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
    c.set("userId", payload.sub as string);
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
