import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  Migrator,
  computeSha256,
  loadMigrationFiles,
  InMemoryMigrationStore,
  MigrationChecksumMismatchError,
  SchemaGateBlockedError,
} from '../db/migrator.js';

export async function runMigratorTests(): Promise<void> {
  console.log('[TEST-SUITE] Running Migration Runner & Checksum Protection Tests...');

  // 1. Verify SHA-256 hashing
  const hash = computeSha256('SELECT 1;');
  if (hash !== '17db4fd369edb9244b9f91d9aeed145c3d04ad8ba6e95d06247f07a63527d11a') {
    throw new Error(`Unexpected SHA-256 hash: ${hash}`);
  }
  console.log('  ✓ SHA-256 checksum calculation produces deterministic hash');

  // 2. Setup temporary migration test directory
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'suoxi-migrator-test-'));

  try {
    const file1 = path.join(tempDir, '0001_initial_tables.sql');
    const file2 = path.join(tempDir, '0002_add_index.sql');

    fs.writeFileSync(file1, 'CREATE TABLE t1 (id INT PRIMARY KEY);');
    fs.writeFileSync(file2, 'CREATE INDEX idx_t1_id ON t1 (id);');

    const files = loadMigrationFiles(tempDir);
    if (files.length !== 2) {
      throw new Error(`Expected 2 migration files, found ${files.length}`);
    }
    if (files[0].version !== '0001_initial_tables' || files[1].version !== '0002_add_index') {
      throw new Error(`Incorrect migration ordering: ${files.map((f) => f.version).join(', ')}`);
    }
    console.log('  ✓ Migration files correctly discovered and sorted lexicographically');

    // 3. Test Migration Plan with In-Memory store
    const store = new InMemoryMigrationStore();
    const migrator = new Migrator({
      migrationsDir: tempDir,
      store,
      schemaVerified: false, // Rule 11: Schema Gate blocked
    });

    const plan = await migrator.plan();
    if (plan.pendingCount !== 2 || plan.appliedCount !== 0) {
      throw new Error(`Expected 2 pending migrations in plan, got ${plan.pendingCount}`);
    }
    console.log('  ✓ Migration plan accurately identifies pending migrations without executing DDL');

    // 4. Test Schema Gate enforcement: applying with schemaVerified: false throws
    try {
      await migrator.applyPending();
      throw new Error('Should have blocked on Schema Gate (Rule 11)');
    } catch (err) {
      if (!(err instanceof SchemaGateBlockedError)) {
        throw new Error(`Expected SchemaGateBlockedError, got ${err}`);
      }
      console.log('  ✓ Schema Gate (Rule 11) blocks DDL execution when schema is unverified');
    }

    // 5. Simulate applied migration in store, then test checksum mismatch detection
    await store.recordMigration('0001_initial_tables', files[0].checksum, 1);

    // Now tamper with 0001_initial_tables.sql
    fs.writeFileSync(file1, 'CREATE TABLE t1 (id INT PRIMARY KEY, tampered_column INT);');

    try {
      await migrator.plan();
      throw new Error('Should have detected checksum mismatch!');
    } catch (err) {
      if (!(err instanceof MigrationChecksumMismatchError)) {
        throw new Error(`Expected MigrationChecksumMismatchError, got ${err}`);
      }
      console.log('  ✓ Migration checksum mismatch detected and safely halted');
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
