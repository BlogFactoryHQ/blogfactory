import { randomBytes, timingSafeEqual } from "node:crypto";
import { hash } from "bcryptjs";
import { and, eq, isNull, or } from "drizzle-orm";
import type { User } from "@workos-inc/node";
import { WorkOS } from "@workos-inc/node";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { bootstrapUserAccess, isAdminEmail } from "./access-control.js";
import { appUrl } from "./polar-client.js";

const SESSION_COOKIE = "wos-session";
const STATE_COOKIE = "wos-auth-state";
const VERIFIER_COOKIE = "wos-auth-verifier";
const RETURN_COOKIE = "wos-auth-return";
const CONSENT_COOKIE = "wos-auth-consent";

export function workosCloudEnabled(env: NodeJS.ProcessEnv = process.env) {
  if (env.BLOGFACTORY_CLOUD !== "true" || !env.WORKOS_API_KEY?.trim() || !env.WORKOS_CLIENT_ID?.trim() || (env.WORKOS_COOKIE_PASSWORD?.trim().length || 0) < 32) return false;
  try { return new URL(env.WORKOS_REDIRECT_URI || "").protocol === "https:"; }
  catch { return false; }
}

export function safeAuthReturnTo(value: string | undefined) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/";
}

// A verified AuthKit user with no local account who never accepted the Cloud
// terms, e.g. someone who picked "Sign up" inside AuthKit after "Continue to sign in".
export class WorkosSignupRequiredError extends Error {
  constructor() { super("Cloud signup requires accepting the terms"); this.name = "WorkosSignupRequiredError"; }
}

export function workosCallbackErrorPath(error: unknown) {
  return error instanceof WorkosSignupRequiredError ? "/auth?mode=signup&error=signup_required" : "/auth?error=auth_failed";
}

function required(name: "WORKOS_API_KEY" | "WORKOS_CLIENT_ID" | "WORKOS_COOKIE_PASSWORD" | "WORKOS_REDIRECT_URI") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for WorkOS AuthKit`);
  return value;
}

function client() {
  return new WorkOS({ apiKey: required("WORKOS_API_KEY"), clientId: required("WORKOS_CLIENT_ID") });
}

function cookieOptions(maxAge?: number) {
  return { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "Lax" as const, path: "/", ...(maxAge ? { maxAge } : {}) };
}

export async function beginWorkosAuth(c: Context, options: { screenHint: "sign-in" | "sign-up"; returnTo?: string; consent: boolean }) {
  const flow = await client().userManagement.getAuthorizationUrlWithPKCE({
    clientId: required("WORKOS_CLIENT_ID"),
    provider: "authkit",
    redirectUri: required("WORKOS_REDIRECT_URI"),
    screenHint: options.screenHint,
  });
  setCookie(c, STATE_COOKIE, flow.state, cookieOptions(600));
  setCookie(c, VERIFIER_COOKIE, flow.codeVerifier, cookieOptions(600));
  setCookie(c, RETURN_COOKIE, safeAuthReturnTo(options.returnTo), cookieOptions(600));
  if (options.consent) setCookie(c, CONSENT_COOKIE, "1", cookieOptions(600));
  else deleteCookie(c, CONSENT_COOKIE, cookieOptions());
  return flow.url;
}

function stateMatches(expected: string | undefined, received: string | undefined) {
  if (!expected || !received || expected.length !== received.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

async function upsertLocalWorkosUser(user: User, allowCreate: boolean, consentAccepted: boolean) {
  if (!user.emailVerified) throw new Error("WorkOS email is not verified");
  const [linked] = await db.select().from(users).where(eq(users.workosUserId, user.id)).limit(1);
  const displayName = user.name || [user.firstName, user.lastName].filter(Boolean).join(" ") || null;
  if (linked) {
    const [updated] = await db.update(users).set({ email: user.email, displayName: displayName || linked.displayName, emailVerified: true, lastLoginAt: new Date() } as never).where(eq(users.id, linked.id)).returning();
    return bootstrapUserAccess(updated);
  }

  const [sameEmail] = await db.select().from(users).where(eq(users.email, user.email)).limit(1);
  if (sameEmail) {
    if (sameEmail.workosUserId && sameEmail.workosUserId !== user.id) throw new Error("Email is linked to another WorkOS identity");
    const [updated] = await db.update(users).set({
      workosUserId: user.id,
      displayName: displayName || sameEmail.displayName,
      emailVerified: true,
      ...(process.env.BLOGFACTORY_CLOUD === "true" ? { approvalStatus: "approved", approvedAt: sameEmail.approvedAt || new Date() } : {}),
      lastLoginAt: new Date(),
    } as never).where(and(eq(users.id, sameEmail.id), or(isNull(users.workosUserId), eq(users.workosUserId, user.id)))).returning();
    if (!updated) throw new Error("WorkOS identity link conflict");
    return bootstrapUserAccess(updated);
  }

  if (!allowCreate) throw new Error("Cloud signup is not available for this account");
  if (!consentAccepted) throw new WorkosSignupRequiredError();
  const admin = isAdminEmail(user.email);
  const [created] = await db.insert(users).values({
    email: user.email,
    workosUserId: user.id,
    passwordHash: await hash(randomBytes(32).toString("hex"), 10),
    displayName,
    emailVerified: true,
    role: admin ? "admin" : "user",
    approvalStatus: "approved",
    approvedAt: new Date(),
    consentAcceptedAt: new Date(),
    marketingOptIn: false,
    lastLoginAt: new Date(),
  } as never).returning();
  return bootstrapUserAccess(created);
}

export async function finishWorkosAuth(c: Context, options: { code?: string; state?: string; allowCreate: boolean }) {
  const expectedState = getCookie(c, STATE_COOKIE);
  const verifier = getCookie(c, VERIFIER_COOKIE);
  if (!options.code || !verifier || !stateMatches(expectedState, options.state)) throw new Error("Invalid WorkOS callback state");

  const response = await client().userManagement.authenticateWithCode({
    clientId: required("WORKOS_CLIENT_ID"),
    code: options.code,
    codeVerifier: verifier,
    session: { sealSession: true, cookiePassword: required("WORKOS_COOKIE_PASSWORD") },
  });
  if (!response.sealedSession) throw new Error("WorkOS did not return a sealed session");
  await upsertLocalWorkosUser(response.user, options.allowCreate, getCookie(c, CONSENT_COOKIE) === "1");
  setCookie(c, SESSION_COOKIE, response.sealedSession, cookieOptions(60 * 60 * 24 * 30));
  for (const name of [STATE_COOKIE, VERIFIER_COOKIE, CONSENT_COOKIE]) deleteCookie(c, name, cookieOptions());
  const returnTo = safeAuthReturnTo(getCookie(c, RETURN_COOKIE));
  deleteCookie(c, RETURN_COOKIE, cookieOptions());
  return returnTo;
}

export async function authenticateWorkosSession(c: Context) {
  const sealed = getCookie(c, SESSION_COOKIE);
  if (!sealed || !workosCloudEnabled()) return null;
  const session = client().userManagement.loadSealedSession({ sessionData: sealed, cookiePassword: required("WORKOS_COOKIE_PASSWORD") });
  const result = await session.authenticate();
  let user = result.authenticated ? result.user : null;
  if (!user) {
    const refreshed = await session.refresh({ cookiePassword: required("WORKOS_COOKIE_PASSWORD") });
    if (!refreshed.authenticated) return null;
    if (refreshed.sealedSession) setCookie(c, SESSION_COOKIE, refreshed.sealedSession, cookieOptions(60 * 60 * 24 * 30));
    user = refreshed.user;
  }
  const [local] = await db.select().from(users).where(eq(users.workosUserId, user.id)).limit(1);
  if (!local) return null;
  return bootstrapUserAccess(local);
}

export async function endWorkosSession(c: Context) {
  const sealed = getCookie(c, SESSION_COOKIE);
  deleteCookie(c, SESSION_COOKIE, cookieOptions());
  if (!sealed) return `${appUrl()}/auth`;
  const session = client().userManagement.loadSealedSession({ sessionData: sealed, cookiePassword: required("WORKOS_COOKIE_PASSWORD") });
  return session.getLogoutUrl({ returnTo: `${appUrl()}/auth` });
}
