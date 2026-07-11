export type MigrationFile = { filename: string; checksum: string; sql: string };
export type AppliedMigration = { filename: string; checksum: string };

export interface MigrationStore {
  lock(): Promise<void>;
  unlock(): Promise<void>;
  ensureLedger(): Promise<void>;
  applied(): Promise<AppliedMigration[]>;
  hasExistingSchema(): Promise<boolean>;
  baseline(files: MigrationFile[]): Promise<void>;
  apply(file: MigrationFile): Promise<void>;
}

export async function runMigrations(files: MigrationFile[], store: MigrationStore, baselineExisting = false) {
  await store.lock();
  try {
    await store.ensureLedger();
    const applied = await store.applied();
    const byFilename = new Map(applied.map((migration) => [migration.filename, migration.checksum]));
    for (const file of files) {
      const checksum = byFilename.get(file.filename);
      if (checksum && checksum !== file.checksum) throw new Error(`Checksum mismatch for applied migration ${file.filename}`);
    }

    if (applied.length === 0 && await store.hasExistingSchema()) {
      if (!baselineExisting) {
        throw new Error("Existing schema has no migration ledger. Verify it is current, then rerun with MIGRATION_BASELINE_EXISTING=true.");
      }
      await store.baseline(files);
      return { applied: [], baselined: files.map((file) => file.filename) };
    }

    const pending = files.filter((file) => !byFilename.has(file.filename));
    for (const file of pending) await store.apply(file);
    return { applied: pending.map((file) => file.filename), baselined: [] };
  } finally {
    await store.unlock();
  }
}
