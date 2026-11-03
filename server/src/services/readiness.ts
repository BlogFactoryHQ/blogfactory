import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { checkBucketAccess } from "./s3-client.js";
import { assertManagedCatalogReady } from "./managed-openrouter.js";

export function assertCloudLaunchConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (env.BLOGFACTORY_CLOUD === "true") {
    for (const key of ["WORKOS_API_KEY", "WORKOS_CLIENT_ID", "WORKOS_COOKIE_PASSWORD", "WORKOS_REDIRECT_URI", "WORKOS_AUTHKIT_ISSUER", "MCP_RESOURCE_URL", "API_KEY_ENCRYPTION_SECRET"] as const) {
      if (!env[key]?.trim()) throw new Error(`${key} is required for hosted Cloud`);
    }
    if (env.WORKOS_COOKIE_PASSWORD!.trim().length < 32) throw new Error("WORKOS_COOKIE_PASSWORD must be at least 32 characters");
    if (env.API_KEY_ENCRYPTION_SECRET!.trim().length < 32) throw new Error("API_KEY_ENCRYPTION_SECRET must be at least 32 characters");
    if (env.API_KEY_ENCRYPTION_SECRET === env.JWT_SECRET) throw new Error("API_KEY_ENCRYPTION_SECRET must be separate from JWT_SECRET");
    if (new URL(env.WORKOS_REDIRECT_URI!).protocol !== "https:") throw new Error("WORKOS_REDIRECT_URI must use HTTPS");
    if (new URL(env.WORKOS_AUTHKIT_ISSUER!).protocol !== "https:") throw new Error("WORKOS_AUTHKIT_ISSUER must use HTTPS");
    if (new URL(env.MCP_RESOURCE_URL!).protocol !== "https:") throw new Error("MCP_RESOURCE_URL must use HTTPS");
  }
  if (env.CLOUD_PUBLIC_SIGNUP === "true") {
    for (const key of ["CLOUD_PUBLIC_LAUNCH_AT", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"] as const) {
      if (!env[key]?.trim()) throw new Error(`${key} is required for public Cloud signup`);
    }
    if (!Number.isFinite(Date.parse(env.CLOUD_PUBLIC_LAUNCH_AT!))) throw new Error("CLOUD_PUBLIC_LAUNCH_AT must be an ISO timestamp");
  }
  if (env.CLOUD_BILLING_ENFORCEMENT === "true") {
    for (const key of ["POLAR_ACCESS_TOKEN", "POLAR_WEBHOOK_SECRET", "POLAR_PRODUCT_CLOUD_MONTHLY", "POLAR_PRODUCT_CLOUD_YEARLY", "POLAR_PRODUCT_ADVANCED_MONTHLY", "POLAR_PRODUCT_ADVANCED_YEARLY", "POLAR_PRODUCT_AI_CREDITS_14000"] as const) {
      if (!env[key]?.trim()) throw new Error(`${key} is required for Cloud billing`);
    }
  }
}

export async function readinessStatus(checks: Array<() => Promise<unknown>> = [
  async () => assertCloudLaunchConfigured(),
  () => db.execute(sql`select 1`),
  () => checkBucketAccess(),
  () => assertManagedCatalogReady(),
]) {
  try {
    await Promise.all(checks.map((check) => check()));
    return { ready: true as const, status: 200 as const };
  } catch {
    return { ready: false as const, status: 503 as const };
  }
}
