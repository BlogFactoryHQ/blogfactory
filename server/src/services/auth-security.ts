import { createHash, createHmac, randomBytes } from "node:crypto";
import { lt, sql } from "drizzle-orm";
import type { Context } from "hono";
import { db } from "../db/index.js";
import { authRateLimits } from "../db/schema.js";
import { ApiError } from "../http/error-contract.js";
import { appUrl } from "./polar-client.js";

export const newAuthToken = () => randomBytes(32).toString("hex");
export const hashAuthToken = (token: string) => createHash("sha256").update(token).digest("hex");

function rateLimitKey(kind: string, value: string) {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET || process.env.JWT_SECRET || "dev-rate-limit";
  return createHmac("sha256", secret).update(`${kind}:${value.trim().toLowerCase()}`).digest("hex");
}

export function requestIp(c: Context) {
  return c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function consumeAuthRateLimit(kind: string, value: string, limit: number, windowSeconds: number) {
  const key = rateLimitKey(kind, value);
  const rows = await db.execute(sql<{ attempts: number }>`
    INSERT INTO auth_rate_limits (bucket_key, attempts, window_started_at, expires_at)
    VALUES (${key}, 1, NOW(), NOW() + (${windowSeconds} * INTERVAL '1 second'))
    ON CONFLICT (bucket_key) DO UPDATE SET
      attempts = CASE WHEN auth_rate_limits.expires_at <= NOW() THEN 1 ELSE auth_rate_limits.attempts + 1 END,
      window_started_at = CASE WHEN auth_rate_limits.expires_at <= NOW() THEN NOW() ELSE auth_rate_limits.window_started_at END,
      expires_at = CASE WHEN auth_rate_limits.expires_at <= NOW() THEN NOW() + (${windowSeconds} * INTERVAL '1 second') ELSE auth_rate_limits.expires_at END
    RETURNING attempts`);
  if (Number(rows[0]?.attempts || 0) > limit) throw new ApiError(429, "rate_limited", "Too many requests. Try again later.");
}

export async function purgeExpiredAuthRateLimits() {
  return (await db.delete(authRateLimits).where(lt(authRateLimits.expiresAt, new Date())).returning({ key: authRateLimits.bucketKey })).length;
}

export async function verifyTurnstile(token: string, ip: string) {
  if (process.env.BLOGFACTORY_CLOUD !== "true") return;
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) throw new ApiError(503, "service_unavailable", "Signup verification is not configured");
  const form = new FormData();
  form.set("secret", secret); form.set("response", token); if (ip !== "unknown") form.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form, signal: AbortSignal.timeout(8_000) });
  const result = await response.json() as { success?: boolean };
  if (!response.ok || !result.success) throw new ApiError(400, "validation_error", "Signup verification failed");
}

async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) throw new Error("RESEND_API_KEY is not configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(8_000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "BlogFactory <no-reply@blogfactory.io>", reply_to: "hello@ortakalan.media", to: [to], subject, html }),
  });
  if (!response.ok) throw new Error(`Resend delivery failed (${response.status})`);
}

export function sendVerificationEmail(email: string, token: string) {
  const url = `${appUrl()}/auth?verify=${encodeURIComponent(token)}`;
  return sendEmail(email, "Verify your BlogFactory email", `<p>Verify your BlogFactory email:</p><p><a href="${url}">Verify email</a></p><p>This link expires in 24 hours.</p>`);
}

export function sendResetEmail(email: string, token: string) {
  const url = `${appUrl()}/auth?reset=${encodeURIComponent(token)}`;
  return sendEmail(email, "Reset your BlogFactory password", `<p>Reset your BlogFactory password:</p><p><a href="${url}">Reset password</a></p><p>This link expires in 1 hour.</p>`);
}
