import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { runMigrations, type MigrationFile, type MigrationStore } from "./migration-runner.js";

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");
const files: MigrationFile[] = readdirSync(migrationsDir)
  .filter((filename) => filename.endsWith(".sql"))
  .sort()
  .map((filename) => {
    const migrationSql = readFileSync(join(migrationsDir, filename), "utf8");
    return { filename, sql: migrationSql, checksum: createHash("sha256").update(migrationSql).digest("hex") };
  });

async function migrate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const sql = postgres(connectionString, { max: 1 });
  const store: MigrationStore = {
    lock: async () => { await sql`SELECT pg_advisory_lock(hashtext('blogfactory:migrations'))`; },
    unlock: async () => { await sql`SELECT pg_advisory_unlock(hashtext('blogfactory:migrations'))`; },
    ensureLedger: async () => { await sql`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`; },
    applied: async () => await sql<{ filename: string; checksum: string }[]>`SELECT filename, checksum FROM schema_migrations ORDER BY filename`,
    hasExistingSchema: async () => Boolean((await sql<{ exists: boolean }[]>`SELECT to_regclass('public.users') IS NOT NULL AS exists`)[0]?.exists),
    baseline: async (migrations) => {
      await sql.begin(async (tx) => {
        for (const migration of migrations) await tx`INSERT INTO schema_migrations (filename, checksum) VALUES (${migration.filename}, ${migration.checksum})`;
      });
    },
    apply: async (migration) => {
      console.log(`  Applying ${migration.filename}...`);
      await sql.begin(async (tx) => {
        await tx.unsafe(migration.sql);
        await tx`INSERT INTO schema_migrations (filename, checksum) VALUES (${migration.filename}, ${migration.checksum})`;
      });
    },
  };

  try {
    const result = await runMigrations(files, store, process.env.MIGRATION_BASELINE_EXISTING === "true");
    if (result.baselined.length) console.log(`Baselined ${result.baselined.length} existing migrations.`);
    else if (!result.applied.length) console.log("Database is up to date.");
    else console.log(`Applied ${result.applied.length} migrations.`);
  } finally {
    await sql.end();
  }
}

migrate().catch((error) => {
  console.error("Migration failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
