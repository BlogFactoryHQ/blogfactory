import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { userApiKeys } from "../db/schema.js";

type Provider = "openrouter" | "google";

function encryptionKey(): Buffer {
  const secret = process.env.API_KEY_ENCRYPTION_SECRET || process.env.JWT_SECRET;
  if (!secret || secret === "dev-secret") {
    throw new Error("API key encryption secret is not configured");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":");
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Invalid encrypted API key format");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function last4(value: string): string {
  return value.slice(-4);
}

function metadata(row?: typeof userApiKeys.$inferSelect | null) {
  return {
    hasOpenrouterKey: Boolean(row?.openrouterApiKeyEncrypted),
    openrouterKeyLast4: row?.openrouterKeyLast4 || null,
    hasGoogleAiKey: Boolean(row?.googleAiKeyEncrypted),
    googleKeyLast4: row?.googleKeyLast4 || null,
    updatedAt: row?.updatedAt || null,
  };
}

export async function getApiKeyMetadata(userId: string) {
  const [row] = await db.select().from(userApiKeys).where(eq(userApiKeys.userId, userId)).limit(1);
  return metadata(row);
}

export async function setApiKey(userId: string, provider: Provider, apiKey: string) {
  const trimmed = apiKey.trim();
  if (provider === "openrouter" && !trimmed.startsWith("sk-or-")) {
    throw new Error("OpenRouter keys should start with sk-or-");
  }
  if (provider === "google" && trimmed.length < 20) {
    throw new Error("Google API key looks too short");
  }

  const values =
    provider === "openrouter"
      ? {
          userId,
          openrouterApiKeyEncrypted: encryptSecret(trimmed),
          openrouterKeyLast4: last4(trimmed),
          updatedAt: new Date(),
        }
      : {
          userId,
          googleAiKeyEncrypted: encryptSecret(trimmed),
          googleKeyLast4: last4(trimmed),
          updatedAt: new Date(),
        };

  await db
    .insert(userApiKeys)
    .values(values)
    .onConflictDoUpdate({
      target: userApiKeys.userId,
      set: values,
    });

  return getApiKeyMetadata(userId);
}

export async function deleteApiKey(userId: string, provider: Provider) {
  const set =
    provider === "openrouter"
      ? {
          openrouterApiKeyEncrypted: null,
          openrouterKeyLast4: null,
          updatedAt: new Date(),
        }
      : {
          googleAiKeyEncrypted: null,
          googleKeyLast4: null,
          updatedAt: new Date(),
        };

  await db.update(userApiKeys).set(set).where(eq(userApiKeys.userId, userId));
  return getApiKeyMetadata(userId);
}

export async function getOpenRouterKey(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ key: userApiKeys.openrouterApiKeyEncrypted })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId))
    .limit(1);
  return row?.key ? decryptSecret(row.key) : null;
}

export async function getGoogleAiKey(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ key: userApiKeys.googleAiKeyEncrypted })
    .from(userApiKeys)
    .where(eq(userApiKeys.userId, userId))
    .limit(1);
  return row?.key ? decryptSecret(row.key) : null;
}
