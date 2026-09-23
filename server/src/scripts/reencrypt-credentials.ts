import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { indexingIntegrations, searchConsoleIntegrations, siteIntegrations, userApiKeys } from "../db/schema.js";
import { reencryptSecret, secretNeedsReencryption } from "../services/api-keys.js";

const write = process.argv.includes("--write");
if (write && process.env.API_KEY_REENCRYPT_ALLOW_WRITES !== "1") {
  throw new Error("Set API_KEY_REENCRYPT_ALLOW_WRITES=1 to use --write");
}

let found = 0;
let changed = 0;

for (const table of [siteIntegrations, indexingIntegrations, searchConsoleIntegrations] as const) {
  const rows = await db.select({ id: table.id, value: table.credentialsEncrypted }).from(table);
  for (const row of rows) {
    if (!secretNeedsReencryption(row.value)) continue;
    found += 1;
    if (write) {
      await db.update(table).set({ credentialsEncrypted: reencryptSecret(row.value), updatedAt: new Date() }).where(eq(table.id, row.id));
      changed += 1;
    }
  }
}

const keyColumns = [
  "openrouterApiKeyEncrypted",
  "googleAiKeyEncrypted",
  "openaiApiKeyEncrypted",
  "replicateApiKeyEncrypted",
  "pexelsApiKeyEncrypted",
  "pixabayApiKeyEncrypted",
] as const;
const keyRows = await db.select().from(userApiKeys);
for (const row of keyRows) {
  const updates: Partial<typeof userApiKeys.$inferInsert> = {};
  for (const column of keyColumns) {
    const value = row[column];
    if (!value || !secretNeedsReencryption(value)) continue;
    found += 1;
    updates[column] = reencryptSecret(value);
  }
  if (write && Object.keys(updates).length) {
    updates.updatedAt = new Date();
    await db.update(userApiKeys).set(updates).where(eq(userApiKeys.id, row.id));
    changed += Object.keys(updates).length - 1;
  }
}

console.log(JSON.stringify({ mode: write ? "write" : "dry-run", credentials_found: found, credentials_reencrypted: changed }));
process.exit(0);
