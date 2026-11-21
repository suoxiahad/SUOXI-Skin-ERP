/**
 * SUOXI Skin Care & Aesthetic Center ERP
 * PostgreSQL Idempotent Migration Runner with SHA-256 Checksum Verification
 *
 * Usage:
 *   npm run pg:migrate           # Apply all pending migrations in /db/postgres/migrations
 *   npm run pg:status            # Show applied vs pending migrations without executing
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { closePgPool, getPgPool, isPostgresConfigured, withPgTransaction } from './pgPool.ts';

export const DEFAULT_MIGRATIONS_DIR = path.resolve(process.cwd(), 'db', 'postgres', 'migrations');

export interface AppliedMigrationRow {
  filename: string;
  checksum: string;
  applied_at: string;
}

export interface MigrationStatusEntry {
  filename: string;
  checksum: string;
  status: 'applied' | 'pending' | 'checksum_mismatch';
  appliedAt?: string;
}

export function computeMigrationChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function listMigrationFiles(migrationsDir = DEFAULT_MIGRATIONS_DIR): string[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
}

export async function ensureSchemaMigrationsTable(): Promise<void> {
  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

export async function getMigrationStatus(
  migrationsDir = DEFAULT_MIGRATIONS_DIR
): Promise<MigrationStatusEntry[]> {
  await ensureSchemaMigrationsTable();
  const pool = getPgPool();
  const appliedRes = await pool.query<AppliedMigrationRow>(
    'SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename ASC'
  );
  const appliedMap = new Map(appliedRes.rows.map((r) => [r.filename, r]));
  const files = listMigrationFiles(migrationsDir);

  return files.map((file) => {
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    const checksum = computeMigrationChecksum(sql);
    const existing = appliedMap.get(file);
    if (!existing) {
      return { filename: file, checksum, status: 'pending' };
    }
    if (existing.checksum !== checksum) {
      return {
        filename: file,
        checksum,
        status: 'checksum_mismatch',
        appliedAt: String(existing.applied_at),
      };
    }
    return {
      filename: file,
      checksum,
      status: 'applied',
      appliedAt: String(existing.applied_at),
    };
  });
}

export async function runPgMigrations(options: {
  migrationsDir?: string;
  useAdvisoryLock?: boolean;
  silent?: boolean;
} = {}): Promise<{ applied: string[]; skipped: string[] }> {
  const migrationsDir = options.migrationsDir || DEFAULT_MIGRATIONS_DIR;
  const log = options.silent ? () => {} : (msg: string) => console.log(msg);

  await ensureSchemaMigrationsTable();
  const pool = getPgPool();

  let locked = false;
  if (options.useAdvisoryLock !== false) {
    try {
      await pool.query('SELECT pg_advisory_lock(88421001)');
      locked = true;
    } catch {
      // Single-connection embedded engines may not need advisory locks
    }
  }

  try {
    const appliedRes = await pool.query<AppliedMigrationRow>(
      'SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename ASC'
    );
    const appliedMap = new Map(appliedRes.rows.map((r) => [r.filename, r]));
    const files = listMigrationFiles(migrationsDir);

    const applied: string[] = [];
    const skipped: string[] = [];

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, 'utf8');
      const sum = computeMigrationChecksum(sql);
      const existing = appliedMap.get(file);

      if (existing) {
        if (existing.checksum !== sum) {
          throw new Error(
            `Migration checksum mismatch for ${file}. Never edit an already-applied migration; create a new numbered migration instead.`
          );
        }
        skipped.push(file);
        continue;
      }

      log(`[SUOXI PG Migrate] Applying ${file}...`);
      await withPgTransaction(async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
          file,
          sum,
        ]);
      });
      applied.push(file);
      log(`[SUOXI PG Migrate] Applied ${file}`);
    }

    if (applied.length === 0) {
      log('[SUOXI PG Migrate] Database is already up to date.');
    } else {
      log(`[SUOXI PG Migrate] Successfully applied ${applied.length} migration(s).`);
    }

    return { applied, skipped };
  } finally {
    if (locked) {
      await pool.query('SELECT pg_advisory_unlock(88421001)').catch(() => {});
    }
  }
}

async function runCli(): Promise<void> {
  const statusOnly = process.argv.includes('--status');

  if (!isPostgresConfigured()) {
    console.error('[SUOXI PG Migrate] DATABASE_URL (postgresql://...) is not set in environment.');
    process.exit(1);
  }

  if (statusOnly) {
    const entries = await getMigrationStatus();
    console.log(`[SUOXI PG Migrate] Status (${entries.length} migration file(s)):`);
    for (const entry of entries) {
      if (entry.status === 'applied') {
        console.log(`  [APPLIED]  ${entry.filename} (${entry.appliedAt})`);
      } else if (entry.status === 'checksum_mismatch') {
        console.log(`  [MISMATCH] ${entry.filename} (${entry.appliedAt}) — CHECKSUM MISMATCH`);
      } else {
        console.log(`  [PENDING]  ${entry.filename}`);
      }
    }
    if (entries.some((e) => e.status === 'checksum_mismatch')) {
      process.exitCode = 1;
    }
    return;
  }

  await runPgMigrations();
}

const isDirectExec =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExec) {
  runCli()
    .catch((err) => {
      console.error('[SUOXI PG Migrate] Failed:', err instanceof Error ? err.message : err);
      process.exitCode = 1;
    })
    .finally(async () => {
      await closePgPool();
    });
}
