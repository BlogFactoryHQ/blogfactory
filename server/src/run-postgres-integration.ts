import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const serverRoot = fileURLToPath(new URL("..", import.meta.url));
const migrationFiles = readdirSync(new URL("./db/migrations", import.meta.url)).filter((name) => name.endsWith(".sql"));

async function migrate() {
  const child = Bun.spawn([process.execPath, "run", "src/db/migrate.ts"], {
    cwd: serverRoot,
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  });
  assert.equal(await child.exited, 0, "database migration failed");
}

await migrate();
const sql = postgres(databaseUrl, { max: 4 });

try {
  const before = await sql<{ filename: string; applied_at: Date }[]>`
    SELECT filename, applied_at FROM schema_migrations ORDER BY filename
  `;
  assert.equal(before.length, migrationFiles.length, "migration ledger is incomplete");

  await migrate();
  const after = await sql<{ filename: string; applied_at: Date }[]>`
    SELECT filename, applied_at FROM schema_migrations ORDER BY filename
  `;
  assert.deepEqual(after, before, "repeat migration changed the ledger");

  const columns = await sql<{ column_name: string }[]>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'feeds' AND column_name IN ('run_claim_token', 'run_lease_until', 'run_active_count')
  `;
  assert.equal(columns.length, 3, "feed lease columns are missing");

  const userId = randomUUID();
  const feedId = randomUUID();
  await sql`INSERT INTO users (id, email, password_hash) VALUES (${userId}, ${`lease-${userId}@example.com`}, 'test')`;
  await sql`INSERT INTO feeds (id, user_id, name, source_url) VALUES (${feedId}, ${userId}, 'Lease test', 'https://example.com/feed.xml')`;

  process.env.OPENROUTER_WEBHOOK_SECRET = "integration-secret";
  const { webhooksRoutes } = await import("./routes/webhooks.js");
  const webhook = await webhooksRoutes.request("/openrouter", {
    method: "POST",
    headers: { authorization: "Bearer integration-secret", "content-type": "application/json" },
    body: JSON.stringify({ user_id: userId, model: "integration/model", prompt_tokens: 1, completion_tokens: 2 }),
  });
  assert.equal(webhook.status, 200, "database-backed webhook persistence failed");
  assert.equal((await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM generation_logs WHERE user_id = ${userId}`)[0]?.count, 1);

  const { claimFeedRun, releaseFeedRun } = await import("./services/feed-run-lease.js");
  const now = new Date("2026-07-12T12:00:00.000Z");
  const claims = await Promise.all([
    claimFeedRun({ feedId, userId, token: randomUUID(), slots: 3, now }),
    claimFeedRun({ feedId, userId, token: randomUUID(), slots: 3, now }),
  ]);
  const winner = claims.find((claim) => claim !== null);
  assert.ok(winner, "no feed lease was claimed");
  assert.equal(claims.filter(Boolean).length, 1, "concurrent feed lease was claimed more than once");
  assert.equal(winner.activeCount, 3);

  const repeated = await claimFeedRun({ feedId, userId, token: winner.token, slots: 7, now: new Date(now.getTime() + 1000) });
  assert.equal(repeated?.activeCount, 3, "idempotent claim changed its active slot count");
  assert.equal(await releaseFeedRun({ feedId, userId, token: winner.token, slots: 3 }), 0);

  const expiredToken = randomUUID();
  await sql`
    UPDATE feeds
    SET run_claim_token = ${expiredToken}, run_lease_until = ${new Date(now.getTime() - 1000)}, run_active_count = 1
    WHERE id = ${feedId}
  `;
  const reclaimed = await claimFeedRun({ feedId, userId, token: randomUUID(), slots: 2, now });
  assert.equal(reclaimed?.activeCount, 2, "expired feed lease was not reclaimed");
  assert.equal(await releaseFeedRun({ feedId, userId, token: reclaimed!.token, slots: 2 }), 0);

  const [released] = await sql<{ run_claim_token: string | null; run_lease_until: Date | null; run_active_count: number }[]>`
    SELECT run_claim_token, run_lease_until, run_active_count FROM feeds WHERE id = ${feedId}
  `;
  assert.deepEqual(released, { run_claim_token: null, run_lease_until: null, run_active_count: 0 });
  await sql`DELETE FROM users WHERE id = ${userId}`;
} finally {
  await sql.end();
}

console.log("PostgreSQL migration and feed lease integration check passed");
