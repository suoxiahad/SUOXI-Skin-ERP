/**
 * SUOXI Skin Care & Aesthetic Center CRM
 * PostgreSQL Idempotent Migration Runner
 *
 * Usage:
 *   npm run pg:migrate           # Apply all pending migrations in /db/postgres/migrations
 *   npm run pg:status            # Show applied vs pending migrations without executing
 */

import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { closePgPool, getPgPool, isPostgresConfigured, withPgTransaction } from './pgPool.ts';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'db', 'postgres', 'migrations');

interface AppliedMigrationRow {
  filename: string;
  checksum: string;
  applied_at: string;
}

function sha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  }
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

async function ensureMigrationsTable(): Promise<void> {
  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum VARCHAR(64) NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function run(): Promise<void> {
  const statusOnly = process.argv.includes('--status');

  if (!isPostgresConfigured()) {
    console.error('[SUOXI PG Migrate] DATABASE_URL (postgresql://...) is not set in environment.');
    process.exit(1);
  }

  await ensureMigrationsTable();

  const pool = getPgPool();
  const appliedRes = await pool.query<AppliedMigrationRow>(
    'SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename ASC'
  );
  const appliedMap = new Map(appliedRes.rows.map((r) => [r.filename, r]));
  const files = listMigrationFiles();

  if (statusOnly) {
    console.log(`[SUOXI PG Migrate] Status (${files.length} migration file(s)):`);
    for (const file of files) {
      const existing = appliedMap.get(file);
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      const sum = sha256(sql);
      if (existing) {
        const mismatch = existing.checksum !== sum ? ' [CHECKSUM MISMATCH]' : '';
        console.log(`  [APPLIED]  ${file} (${existing.applied_at})${mismatch}`);
      } else {
        console.log(`  [PENDING]  ${file}`);
      }
    }
    return;
  }

  let appliedCount = 0;
  for (const file of files) {
    const fullPath = path.join(MIGRATIONS_DIR, file);
    const sql = fs.readFileSync(fullPath, 'utf8');
    const sum = sha256(sql);
    const existing = appliedMap.get(file);

    if (existing) {
      if (existing.checksum !== sum) {
        throw new Error(
          `Migration checksum mismatch for ${file}. Never edit an already-applied migration; create a new numbered migration instead.`
        );
      }
      continue;
    }

    console.log(`[SUOXI PG Migrate] Applying ${file}...`);
    await withPgTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2)', [
        file,
        sum,
      ]);
    });
    appliedCount += 1;
    console.log(`[SUOXI PG Migrate] Applied ${file}`);
  }

  if (appliedCount === 0) {
    console.log('[SUOXI PG Migrate] Database is already up to date.');
  } else {
    console.log(`[SUOXI PG Migrate] Successfully applied ${appliedCount} migration(s).`);
  }
}

run()
  .catch((err) => {
    console.error('[SUOXI PG Migrate] Failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePgPool();
  });
