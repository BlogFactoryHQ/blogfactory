import { db } from "./db/index.js";
import { indexingIntegrations, searchConsoleIntegrations, siteIntegrations, userApiKeys } from "./db/schema.js";
import { accountCredentialStatus, encryptedCredentialStatus, getOpenRouterKey, type CredentialStatus, type Provider } from "./services/api-keys.js";
import { testIndexingIntegration } from "./services/indexing.js";
import { testIntegration } from "./services/publishing.js";
import { testSearchConsoleIntegration } from "./services/search-console.js";

type Counts = Record<CredentialStatus, number>;
type CheckRow = { family: string; provider: string; status: CredentialStatus; connected: boolean; smoke?: "passed" | "failed" | "skipped"; error?: string };

const smoke = process.argv.includes("--smoke");
const emptyCounts = (): Counts => ({ usable: 0, missing: 0, undecryptable: 0 });
const add = (counts: Counts, status: CredentialStatus) => { counts[status] += 1; };

async function main() {
  const rows: CheckRow[] = [];
  const keyRows = await db.select().from(userApiKeys);

  for (const row of keyRows) {
    for (const [provider, value] of [
      ["openrouter", row.openrouterApiKeyEncrypted],
      ["google", row.googleAiKeyEncrypted],
      ["openai", row.openaiApiKeyEncrypted],
      ["pexels", row.pexelsApiKeyEncrypted],
      ["pixabay", row.pixabayApiKeyEncrypted],
    ] as Array<[Provider, string | null]>) {
      rows.push({ family: "user_api_keys", provider, status: accountCredentialStatus(provider, value), connected: Boolean(value) });
    }
  }

  const publishingRows = await db.select().from(siteIntegrations);
  for (const row of publishingRows) rows.push({ family: "publishing", provider: row.provider, status: encryptedCredentialStatus(row.credentialsEncrypted), connected: row.status === "connected" });

  const indexingRows = await db.select().from(indexingIntegrations);
  for (const row of indexingRows) rows.push({ family: "indexing", provider: row.provider, status: encryptedCredentialStatus(row.credentialsEncrypted), connected: row.status === "connected" });

  const searchRows = await db.select().from(searchConsoleIntegrations);
  for (const row of searchRows) rows.push({ family: "search_console", provider: "google", status: encryptedCredentialStatus(row.credentialsEncrypted), connected: row.status === "connected" });

  if (smoke) {
    for (const row of rows) {
      if (row.status !== "usable") {
        row.smoke = "skipped";
      }
    }

    for (const keyRow of keyRows) {
      const target = rows.find((row) => row.family === "user_api_keys" && row.provider === "openrouter" && row.status === "usable" && !row.smoke);
      if (!target || target.status !== "usable") continue;
      try {
        const key = await getOpenRouterKey(keyRow.userId);
        if (!key) throw new Error("OpenRouter key unavailable");
        const response = await fetch("https://openrouter.ai/api/v1/key", { headers: { Authorization: `Bearer ${key}` } });
        if (!response.ok) throw new Error(`OpenRouter key check failed: ${response.status}`);
        target.smoke = "passed";
      } catch (error) {
        target.smoke = "failed";
        target.error = error instanceof Error ? error.message : "OpenRouter smoke check failed";
      }
    }

    for (const integration of publishingRows) await smokeOne(rows, "publishing", integration.provider, () => testIntegration(integration));
    for (const integration of indexingRows) await smokeOne(rows, "indexing", integration.provider, () => testIndexingIntegration(integration));
    for (const integration of searchRows) await smokeOne(rows, "search_console", "google", () => testSearchConsoleIntegration(integration));
  }

  const summary: Record<string, Record<string, Counts>> = {};
  for (const row of rows) {
    summary[row.family] ||= {};
    summary[row.family][row.provider] ||= emptyCounts();
    add(summary[row.family][row.provider], row.status);
  }

  const failures = rows.filter((row) =>
    (row.connected && row.status === "undecryptable")
    || row.smoke === "failed"
    || (row.family === "user_api_keys" && row.provider === "openrouter" && row.status === "undecryptable")
  );

  console.log(JSON.stringify({ ok: failures.length === 0, smoke, summary, failures }, null, 2));
  if (failures.length) process.exit(1);
}

async function smokeOne(rows: CheckRow[], family: string, provider: string, check: () => Promise<unknown>) {
  const target = rows.find((row) => row.family === family && row.provider === provider && row.status === "usable" && row.smoke !== "passed");
  if (!target) return;
  try {
    await check();
    target.smoke = "passed";
  } catch (error) {
    target.smoke = "failed";
    target.error = error instanceof Error ? error.message : "Smoke check failed";
  }
}

await main();
