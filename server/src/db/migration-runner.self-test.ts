import assert from "node:assert/strict";
import { runMigrations, type AppliedMigration, type MigrationFile, type MigrationStore } from "./migration-runner.js";

const files: MigrationFile[] = [
  { filename: "0001_a.sql", checksum: "one", sql: "one" },
  { filename: "0001_b.sql", checksum: "two", sql: "two" },
];

function fakeStore(options: { existing?: boolean; applied?: AppliedMigration[]; fail?: string } = {}) {
  const ledger = [...(options.applied || [])];
  const calls: string[] = [];
  const store: MigrationStore = {
    lock: async () => { calls.push("lock"); },
    unlock: async () => { calls.push("unlock"); },
    ensureLedger: async () => { calls.push("ledger"); },
    applied: async () => [...ledger],
    hasExistingSchema: async () => Boolean(options.existing),
    baseline: async (pending) => { ledger.push(...pending.map(({ filename, checksum }) => ({ filename, checksum }))); calls.push("baseline"); },
    apply: async (file) => {
      calls.push(`apply:${file.filename}`);
      if (options.fail === file.filename) throw new Error("failed migration");
      ledger.push({ filename: file.filename, checksum: file.checksum });
    },
  };
  return { store, ledger, calls };
}

const fresh = fakeStore();
assert.deepEqual((await runMigrations(files, fresh.store)).applied, ["0001_a.sql", "0001_b.sql"]);
assert.deepEqual((await runMigrations(files, fresh.store)).applied, []);
assert.equal(fresh.calls.filter((call) => call.startsWith("apply:")).length, 2);

const existing = fakeStore({ existing: true });
await assert.rejects(() => runMigrations(files, existing.store), /MIGRATION_BASELINE_EXISTING/);
assert.deepEqual((await runMigrations(files, existing.store, true)).baselined, ["0001_a.sql", "0001_b.sql"]);

const drift = fakeStore({ applied: [{ filename: "0001_a.sql", checksum: "changed" }] });
await assert.rejects(() => runMigrations(files, drift.store), /Checksum mismatch/);

const failing = fakeStore({ fail: "0001_b.sql" });
await assert.rejects(() => runMigrations(files, failing.store), /failed migration/);
assert.deepEqual(failing.ledger.map((entry) => entry.filename), ["0001_a.sql"]);
assert.equal(failing.calls.at(-1), "unlock");

console.log("migration runner self-check passed");
