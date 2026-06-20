import { Hono } from "hono";
import { hash, compare } from "bcryptjs";
import { db } from "../db/index.js";
import { users } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { signJwt, getUserId } from "../middleware/auth.js";
import { randomBytes } from "crypto";

export const authRoutes = new Hono();

authRoutes.post("/signup", async (c) => {
  const { email, password, displayName, consent, marketingOptIn } = await c.req.json();
  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  if (!consent) {
    return c.json({ error: "You must accept the Privacy Policy and Terms of Service" }, 400);
  }

  if (password.length < 6) {
    return c.json({ error: "Password must be at least 6 characters" }, 400);
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: "Email already registered" }, 409);
  }

  const passwordHash = await hash(password, 10);
  const verifyToken = randomBytes(32).toString("hex");

  const [user] = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      displayName: displayName || null,
      consentAcceptedAt: new Date(),
      marketingOptIn: marketingOptIn ?? false,
      verifyToken,
    })
    .returning({ id: users.id, email: users.email, displayName: users.displayName, emailVerified: users.emailVerified });

  // In production, send verification email here with verifyToken
  // For dev, auto-verify
  if (process.env.NODE_ENV !== "production") {
    await db.update(users).set({ emailVerified: true, verifyToken: null }).where(eq(users.id, user.id));
    user.emailVerified = true;
  }

  const token = await signJwt(user.id);
  return c.json({ token, user });
});

authRoutes.post("/login", async (c) => {
  const { email, password, rememberMe } = await c.req.json();
  if (!email || !password) {
    return c.json({ error: "Email and password are required" }, 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  if (!user || !(await compare(password, user.passwordHash))) {
    return c.json({ error: "Invalid email or password" }, 401);
  }

  if (!user.emailVerified) {
    return c.json({ error: "Please verify your email before signing in" }, 403);
  }

  const token = await signJwt(user.id, rememberMe ?? false);
  return c.json({
    token,
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
});

authRoutes.get("/me", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Not authenticated" }, 401);

  const [user] = await db
    .select({ id: users.id, email: users.email, displayName: users.displayName, emailVerified: users.emailVerified, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) return c.json({ error: "User not found" }, 404);
  return c.json(user);
});

authRoutes.post("/forgot-password", async (c) => {
  const { email } = await c.req.json();
  if (!email) {
    return c.json({ error: "Email is required" }, 400);
  }

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);

  // Always return success to prevent email enumeration
  if (!user) {
    return c.json({ message: "If an account with that email exists, a reset link has been sent." });
  }

  const resetToken = randomBytes(32).toString("hex");
  const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  await db.update(users).set({ resetToken, resetTokenExpiresAt }).where(eq(users.id, user.id));

  // In production, send email with reset link containing resetToken
  // For dev, log it
  if (process.env.NODE_ENV !== "production") {
    console.log(`[DEV] Password reset token for ${email}: ${resetToken}`);
  }

  return c.json({ message: "If an account with that email exists, a reset link has been sent." });
});

authRoutes.post("/reset-password", async (c) => {
  const { token, password } = await c.req.json();
  if (!token || !password) {
    return c.json({ error: "Token and new password are required" }, 400);
  }

  if (password.length < 6) {
    return c.json({ error: "Password must be at least 6 characters" }, 400);
  }

  const [user] = await db
    .select({ id: users.id, resetTokenExpiresAt: users.resetTokenExpiresAt })
    .from(users)
    .where(eq(users.resetToken, token))
    .limit(1);

  if (!user) {
    return c.json({ error: "Invalid or expired reset token" }, 400);
  }

  if (user.resetTokenExpiresAt && new Date() > user.resetTokenExpiresAt) {
    return c.json({ error: "Reset token has expired. Please request a new one." }, 400);
  }

  const passwordHash = await hash(password, 10);
  await db.update(users).set({ passwordHash, resetToken: null, resetTokenExpiresAt: null }).where(eq(users.id, user.id));

  return c.json({ message: "Password reset successfully. You can now sign in." });
});

authRoutes.post("/verify-email", async (c) => {
  const { token } = await c.req.json();
  if (!token) {
    return c.json({ error: "Verification token is required" }, 400);
  }

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.verifyToken, token))
    .limit(1);

  if (!user) {
    return c.json({ error: "Invalid verification token" }, 400);
  }

  await db.update(users).set({ emailVerified: true, verifyToken: null }).where(eq(users.id, user.id));

  return c.json({ message: "Email verified successfully. You can now sign in." });
});

authRoutes.post("/google", async (c) => {
  const { credential } = await c.req.json();
  if (!credential) {
    return c.json({ error: "Google credential is required" }, 400);
  }

  // Decode Google JWT ID token (header.payload.signature)
  try {
    const parts = credential.split(".");
    if (parts.length !== 3) throw new Error("Invalid token format");

    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    const { email, name, sub: googleId, email_verified } = payload;

    if (!email) {
      return c.json({ error: "Google account has no email" }, 400);
    }

    // Check if user exists by googleId or email
    let [user] = await db.select().from(users).where(eq(users.googleId, googleId)).limit(1);

    if (!user) {
      [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    }

    if (user) {
      // Link Google ID if not already linked
      if (!user.googleId) {
        await db.update(users).set({ googleId, emailVerified: true }).where(eq(users.id, user.id));
      }
      const token = await signJwt(user.id);
      return c.json({ token, user: { id: user.id, email: user.email, displayName: user.displayName } });
    }

    // Create new user via Google
    const dummyHash = await hash(randomBytes(32).toString("hex"), 10);
    const [newUser] = await db
      .insert(users)
      .values({
        email,
        passwordHash: dummyHash,
        displayName: name || null,
        googleId,
        emailVerified: true,
        consentAcceptedAt: new Date(),
      })
      .returning({ id: users.id, email: users.email, displayName: users.displayName });

    const token = await signJwt(newUser.id);
    return c.json({ token, user: newUser });
  } catch (err: any) {
    console.error("Google auth error:", err);
    return c.json({ error: "Failed to authenticate with Google" }, 400);
  }
});
