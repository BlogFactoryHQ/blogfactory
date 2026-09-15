import { Hono } from "hono";
import { hash, compare } from "bcryptjs";
import { db } from "../db/index.js";
import { personas, sites, users } from "../db/schema.js";
import { and, eq, gt, sql } from "drizzle-orm";
import { signJwt, getUserId } from "../middleware/auth.js";
import { randomBytes } from "crypto";
import { bootstrapUserAccess, isAdminEmail, publicUser } from "../services/access-control.js";
import { updateGlobalSettings, updateSiteSettings } from "../services/user-settings.js";
import { readJsonObject, requiredString } from "../http/error-contract.js";
import { consumeAuthRateLimit, hashAuthToken, newAuthToken, requestIp, sendResetEmail, sendVerificationEmail, verifyTurnstile } from "../services/auth-security.js";
import { appUrl } from "../services/polar-client.js";
import { cloudCheckoutEnabled } from "../services/billing-config.js";
import { beginWorkosAuth, endWorkosSession, finishWorkosAuth, workosCloudEnabled } from "../services/workos-auth.js";

export const authRoutes = new Hono();

const LOCAL_DEV_EMAIL = "local@blogfactory.dev";
const hostedCloud = () => process.env.BLOGFACTORY_CLOUD === "true";

export function publicSignupEnabled(
  environment = process.env.NODE_ENV,
  selfHostedSignup = process.env.BLOGFACTORY_ALLOW_SIGNUP,
) {
  if (process.env.BLOGFACTORY_CLOUD === "true") {
    return cloudCheckoutEnabled();
  }
  return environment !== "production" || selfHostedSignup === "true";
}

authRoutes.get("/config", (c) => c.json({
  signup_enabled: publicSignupEnabled(),
  auth_provider: hostedCloud() ? "workos" : "local",
  ...(process.env.BLOGFACTORY_CLOUD === "true" && process.env.TURNSTILE_SITE_KEY ? { turnstile_site_key: process.env.TURNSTILE_SITE_KEY } : {}),
}));

authRoutes.post("/workos/start", async (c) => {
  if (!workosCloudEnabled()) return c.json({ error: "WorkOS AuthKit is not configured" }, 404);
  const body = await readJsonObject(c);
  const screenHint = body.screenHint === "sign-up" ? "sign-up" : "sign-in";
  const ip = requestIp(c);
  if (screenHint === "sign-up") {
    if (!publicSignupEnabled()) return c.json({ error: "Public signup is disabled" }, 403);
    if (body.consent !== true) return c.json({ error: "You must accept the Privacy Policy and Terms of Service" }, 400);
    await consumeAuthRateLimit("workos-signup-ip", ip, 5, 60 * 60);
    await verifyTurnstile(typeof body.turnstileToken === "string" ? body.turnstileToken : "", ip);
  } else {
    await consumeAuthRateLimit("workos-login-ip", ip, 20, 15 * 60);
  }
  return c.json({ url: await beginWorkosAuth(c, {
    screenHint,
    returnTo: typeof body.returnTo === "string" ? body.returnTo : undefined,
    consent: screenHint === "sign-up",
  }) });
});

authRoutes.get("/workos/callback", async (c) => {
  if (!workosCloudEnabled()) return c.json({ error: "WorkOS AuthKit is not configured" }, 404);
  try {
    const returnTo = await finishWorkosAuth(c, { code: c.req.query("code"), state: c.req.query("state"), allowCreate: publicSignupEnabled() });
    return c.redirect(`${appUrl()}${returnTo}`);
  } catch (error) {
    console.error("[auth] WorkOS callback failed", { name: error instanceof Error ? error.name : "UnknownError" });
    return c.redirect(`${appUrl()}/auth?error=auth_failed`);
  }
});

authRoutes.post("/workos/logout", async (c) => {
  if (!workosCloudEnabled()) return c.json({ error: "WorkOS AuthKit is not configured" }, 404);
  return c.json({ url: await endWorkosSession(c) });
});

async function ensureLocalDevWorkspace(userId: string) {
  const now = new Date();
  const [existingSite] = await db
    .select()
    .from(sites)
    .where(and(eq(sites.userId, userId), eq(sites.domain, "blogfactory.local")))
    .limit(1);

  const site = existingSite || (await db
    .insert(sites)
    .values({
      userId,
      name: "Local BlogFactory",
      domain: "blogfactory.local",
      sitemapUrl: "https://blogfactory.local/sitemap.xml",
      status: "active",
      pageCount: 4,
      vectorCount: 0,
      topics: ["content", "publishing", "seo"],
      language: "en",
      cta: "Start publishing",
      updatedAt: now,
    } as never)
    .returning())[0];

  await updateGlobalSettings(userId, { activeSiteId: site.id, monthlyBudget: 25, updatedAt: now });
  await updateSiteSettings(userId, site.id, {
    articleWordCount: 1200,
    articleLanguage: "US English",
    enableInternalLinks: false,
    internalLinkStatus: "disconnected",
    internalLinkMode: "all",
    internalLinkDensity: "balanced",
    brandCompanyName: "BlogFactory Local",
    brandDescription: "Local development workspace for testing BlogFactory.",
    updatedAt: now,
  });

  const [existingPersona] = await db
    .select({ id: personas.id })
    .from(personas)
    .where(and(eq(personas.userId, userId), eq(personas.name, "Local Editorial Voice")))
    .limit(1);

  if (!existingPersona) {
    await db.insert(personas).values({
      userId,
      name: "Local Editorial Voice",
      baseModel: "openai/gpt-5-mini",
      systemPrompt: "Write clear, practical, SEO-aware blog posts with concise examples and confident editorial judgment.",
      status: "active",
      language: "en",
      category: "default",
      updatedAt: now,
    } as never);
  }
}

authRoutes.post("/dev-login", async (c) => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ error: "Development login is disabled in production" }, 404);
  }

  const passwordHash = await hash(randomBytes(24).toString("hex"), 10);
  const [existing] = await db.select().from(users).where(eq(users.email, LOCAL_DEV_EMAIL)).limit(1);
  const user = existing || (await db
    .insert(users)
    .values({
      email: LOCAL_DEV_EMAIL,
      passwordHash,
      displayName: "Local Developer",
      role: "admin",
      approvalStatus: "approved",
      approvedAt: new Date(),
      emailVerified: true,
      consentAcceptedAt: new Date(),
      marketingOptIn: false,
    } as never)
    .returning())[0];

  if (existing && (existing.role !== "admin" || existing.approvalStatus !== "approved" || !existing.emailVerified)) {
    await db
      .update(users)
      .set({
        role: "admin",
        approvalStatus: "approved",
        approvedAt: new Date(),
        rejectedAt: null,
        rejectedReason: null,
        emailVerified: true,
      } as never)
      .where(eq(users.id, existing.id));
  }

  await ensureLocalDevWorkspace(user.id);
  await db.update(users).set({ lastLoginAt: new Date() } as never).where(eq(users.id, user.id));

  const token = await signJwt(user.id, true);
  return c.json({
    token,
    user: publicUser({
      ...user,
      role: "admin",
      approvalStatus: "approved",
      emailVerified: true,
      displayName: user.displayName || "Local Developer",
    }),
  });
});

authRoutes.post("/signup", async (c) => {
  if (hostedCloud()) return c.json({ error: "Use WorkOS AuthKit" }, 404);
  if (!publicSignupEnabled()) {
    return c.json({ error: "Public signup is disabled" }, 403);
  }

  const body = await readJsonObject(c);
  const email = requiredString(body, "email");
  const password = requiredString(body, "password");
  const displayName = typeof body.displayName === "string" ? body.displayName : undefined;
  const consent = body.consent === true;
  const marketingOptIn = body.marketingOptIn === true;
  const ip = requestIp(c);
  await Promise.all([
    consumeAuthRateLimit("signup-ip", ip, 5, 60 * 60),
    consumeAuthRateLimit("signup-email", email, 3, 24 * 60 * 60),
  ]);
  await verifyTurnstile(typeof body.turnstileToken === "string" ? body.turnstileToken : "", ip);

  if (!consent) {
    return c.json({ error: "You must accept the Privacy Policy and Terms of Service" }, 400);
  }

  if (password.length < 6) {
    return c.json({ error: "Password must be at least 6 characters" }, 400);
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ message: "If this email can be registered, a verification link has been sent." }, 202);
  }

  const passwordHash = await hash(password, 10);
  const admin = isAdminEmail(email);

  const verifyToken = newAuthToken();
  const isHostedCloud = hostedCloud();
  let [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      displayName: displayName || null,
      role: admin ? "admin" : "user",
      approvalStatus: admin ? "approved" : "pending",
      approvedAt: admin ? new Date() : null,
      emailVerified: !isHostedCloud,
      verifyTokenHash: isHostedCloud ? hashAuthToken(verifyToken) : null,
      verifyTokenExpiresAt: isHostedCloud ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
      consentAcceptedAt: new Date(),
      marketingOptIn: marketingOptIn ?? false,
    } as any)
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      emailVerified: users.emailVerified,
      role: users.role,
      approvalStatus: users.approvalStatus,
      rejectedReason: users.rejectedReason,
      createdAt: users.createdAt,
    });

  user = await bootstrapUserAccess(user);
  if (isHostedCloud) {
    try { await sendVerificationEmail(email, verifyToken); }
    catch (error) {
      await db.delete(users).where(eq(users.id, user.id));
      throw error;
    }
    return c.json({ message: "Check your email to verify your account." }, 202);
  }
  const token = await signJwt(user.id);
  return c.json({ token, user: publicUser(user) });
});

authRoutes.post("/login", async (c) => {
  if (hostedCloud()) return c.json({ error: "Use WorkOS AuthKit" }, 404);
  const body = await readJsonObject(c);
  const email = requiredString(body, "email");
  const password = requiredString(body, "password");
  const rememberMe = body.rememberMe === true;
  const ip = requestIp(c);
  await Promise.all([
    consumeAuthRateLimit("login-ip", ip, 20, 15 * 60),
    consumeAuthRateLimit("login-email", email, 10, 15 * 60),
  ]);

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !(await compare(password, user.passwordHash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (!user.emailVerified) return c.json({ error: "Invalid email or password" }, 401);

  const bootstrapped = await bootstrapUserAccess(user);
  await db.update(users).set({ lastLoginAt: new Date() } as any).where(eq(users.id, bootstrapped.id));

  const token = await signJwt(user.id, rememberMe ?? false);
  return c.json({
    token,
    user: publicUser(bootstrapped),
  });
});

authRoutes.get("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Not authenticated" }, 401);

  const [rawUser] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      emailVerified: users.emailVerified,
      role: users.role,
      approvalStatus: users.approvalStatus,
      rejectedReason: users.rejectedReason,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!rawUser) return c.json({ error: "User not found" }, 404);
  const user = await bootstrapUserAccess(rawUser);
  return c.json(publicUser(user));
});

authRoutes.post("/forgot-password", async (c) => {
  if (hostedCloud()) return c.json({ error: "Use WorkOS AuthKit" }, 404);
  const email = requiredString(await readJsonObject(c), "email");
  await Promise.all([
    consumeAuthRateLimit("forgot-ip", requestIp(c), 5, 60 * 60),
    consumeAuthRateLimit("forgot-email", email, 3, 60 * 60),
  ]);

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  // Always return success to prevent email enumeration
  if (!user) {
    return c.json({ message: "If an account with that email exists, a reset link has been sent." });
  }

  const resetToken = newAuthToken();
  const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.update(users).set({ resetToken: null, resetTokenHash: hashAuthToken(resetToken), resetTokenExpiresAt } as any).where(eq(users.id, user.id));
  await sendResetEmail(email, resetToken).catch((error) => console.error("[auth] Reset email delivery failed", { name: error instanceof Error ? error.name : "UnknownError" }));

  return c.json({ message: "If an account with that email exists, a reset link has been sent." });
});

authRoutes.post("/reset-password", async (c) => {
  if (hostedCloud()) return c.json({ error: "Use WorkOS AuthKit" }, 404);
  const body = await readJsonObject(c);
  const token = requiredString(body, "token");
  const password = requiredString(body, "password");

  if (password.length < 6) {
    return c.json({ error: "Password must be at least 6 characters" }, 400);
  }

  const passwordHash = await hash(password, 10);
  const [updated] = await db.update(users).set({ passwordHash, resetToken: null, resetTokenHash: null, resetTokenExpiresAt: null, sessionVersion: sql`${users.sessionVersion} + 1` } as any)
    .where(and(eq(users.resetTokenHash, hashAuthToken(token)), gt(users.resetTokenExpiresAt, new Date()))).returning({ id: users.id });
  if (!updated) return c.json({ error: "Invalid or expired reset token" }, 400);

  return c.json({ message: "Password reset successfully. You can now sign in." });
});

authRoutes.post("/verify-email", async (c) => {
  if (hostedCloud()) return c.json({ error: "Use WorkOS AuthKit" }, 404);
  const token = requiredString(await readJsonObject(c), "token");

  const [user] = await db.update(users).set({
    emailVerified: true, verifyToken: null, verifyTokenHash: null, verifyTokenExpiresAt: null,
    ...(process.env.BLOGFACTORY_CLOUD === "true" ? { approvalStatus: "approved", approvedAt: new Date() } : {}),
  } as any)
    .where(and(eq(users.verifyTokenHash, hashAuthToken(token)), gt(users.verifyTokenExpiresAt, new Date()), eq(users.emailVerified, false))).returning({ id: users.id });
  if (!user) return c.json({ error: "Invalid verification token" }, 400);

  return c.json({ message: "Email verified successfully. You can now sign in." });
});

authRoutes.post("/resend-verification", async (c) => {
  if (hostedCloud()) return c.json({ error: "Use WorkOS AuthKit" }, 404);
  const email = requiredString(await readJsonObject(c), "email");
  await Promise.all([
    consumeAuthRateLimit("verify-ip", requestIp(c), 5, 60 * 60),
    consumeAuthRateLimit("verify-email", email, 3, 60 * 60),
  ]);
  const [user] = await db.select({ id: users.id, emailVerified: users.emailVerified }).from(users).where(eq(users.email, email)).limit(1);
  if (user && !user.emailVerified) {
    const token = newAuthToken();
    await db.update(users).set({ verifyTokenHash: hashAuthToken(token), verifyTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }).where(eq(users.id, user.id));
    await sendVerificationEmail(email, token);
  }
  return c.json({ message: "If the account needs verification, a link has been sent." });
});

authRoutes.post("/google", async (c) => {
  return c.json({ error: "Google sign-in is disabled during the private beta" }, 403);
});
