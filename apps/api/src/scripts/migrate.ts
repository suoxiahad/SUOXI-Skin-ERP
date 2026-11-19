import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Migrator, MigrationFile, MigrationStore } from '../db/migrator.js';
import { createMigrationPool, MySqlMigrationStore } from '../db/mysqlMigrationStore.js';
import { getConfig } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');
const MIGRATIONS_DIR = path.resolve(REPO_ROOT, 'db/migrations');

// Ensure root .env is loaded if invoked from workspace root or apps/api without overwriting shell env
dotenv.config({ path: path.resolve(REPO_ROOT, '.env') });

export function extractTargetDatabaseName(databaseUrl?: string, fallbackDbName?: string): string {
  if (databaseUrl && databaseUrl.startsWith('mysql://')) {
    try {
      const parsed = new URL(databaseUrl);
      const dbFromPath = parsed.pathname.replace(/^\//, '').trim();
      if (dbFromPath) {
        return dbFromPath;
      }
    } catch {
      // Fallback to DB_NAME if URL cannot be parsed
    }
  }
  return (fallbackDbName || '').trim();
}

export function isProductionDatabaseName(dbName: string): boolean {
  const normalized = dbName.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized === 'production' ||
    normalized === 'prod' ||
    /(^|[_-])prod(uction)?([_-]|$)/i.test(normalized)
  );
}

export function formatMysqlError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const rawMsg =
      (typeof e.sqlMessage === 'string' && e.sqlMessage) ||
      (typeof e.message === 'string' && e.message) ||
      String(err);
    const details: string[] = [];
    if (typeof e.code === 'string') details.push(`code=${e.code}`);
    if (typeof e.errno === 'number') details.push(`errno=${e.errno}`);
    if (typeof e.sqlState === 'string') details.push(`sqlState=${e.sqlState}`);
    return details.length > 0 ? `${rawMsg} (${details.join(', ')})` : rawMsg;
  }
  return String(err);
}

async function runCli(): Promise<void> {
  const mode = process.argv[2];

  if (mode !== 'plan' && mode !== 'up') {
    process.stderr.write('Usage: tsx src/scripts/migrate.ts <plan|up>\n');
    process.exit(1);
  }

  const config = getConfig();
  const targetDbName = extractTargetDatabaseName(config.DATABASE_URL, config.DB_NAME);

  // Safety Guard: Production database requires explicit confirmation to run DDL
  if (mode === 'up' && isProductionDatabaseName(targetDbName)) {
    if (process.env.CONFIRM_PRODUCTION_MIGRATION !== 'yes') {
      process.stderr.write(
        `[ABORTED] Target database "${targetDbName}" is a production database.\n` +
          `To execute migrations against production, set CONFIRM_PRODUCTION_MIGRATION=yes.\n`
      );
      process.exit(1);
    }
  }

  const pool = createMigrationPool();
  const baseStore = new MySqlMigrationStore(pool);

  try {
    if (mode === 'plan') {
      const planner = new Migrator({
        migrationsDir: MIGRATIONS_DIR,
        store: baseStore,
        schemaVerified: false,
      });

      const plan = await planner.plan();
      process.stdout.write(
        `\n[MIGRATE:PLAN] Directory: ${MIGRATIONS_DIR} | Target DB: ${targetDbName || 'N/A'}\n`
      );
      process.stdout.write(
        `[MIGRATE:PLAN] Total files: ${plan.totalFiles}, Applied: ${plan.appliedCount}, Pending: ${plan.pendingCount}\n`
      );

      for (const app of plan.applied) {
        process.stdout.write(
          `[APPLIED] ${app.version}.sql (batch=${app.batch}, checksum=${app.checksum.slice(0, 12)}...)\n`
        );
      }

      for (const file of plan.pending) {
        process.stdout.write(
          `[PENDING] ${file.filename} (checksum=${file.checksum.slice(0, 12)}...)\n`
        );
      }

      process.stdout.write('\n[MIGRATE:PLAN] Dry-run complete. No DDL was executed.\n');
      return;
    }

    // mode === 'up'
    const prePlan = await new Migrator({
      migrationsDir: MIGRATIONS_DIR,
      store: baseStore,
      schemaVerified: false,
    }).plan();

    process.stdout.write(
      `\n[MIGRATE:UP] Target DB: ${targetDbName || 'N/A'} | Pending: ${prePlan.pendingCount} / ${prePlan.totalFiles}\n`
    );

    if (prePlan.pendingCount === 0) {
      process.stdout.write('[MIGRATE:UP] All migrations are already applied. Nothing to do.\n');
      return;
    }

    // Wrap store to emit per-migration log lines and pinpoint the failing filename
    let pendingIndex = 0;
    let currentFile: MigrationFile | null = null;

    const trackedStore: MigrationStore = {
      ensureTrackingTable: () => baseStore.ensureTrackingTable(),
      getAppliedMigrations: () => baseStore.getAppliedMigrations(),
      executeSql: async (sql: string) => {
        currentFile = prePlan.pending[pendingIndex] || null;
        if (currentFile) {
          process.stdout.write(
            `[RUNNING] ${currentFile.filename} (checksum=${currentFile.checksum.slice(0, 12)}...)\n`
          );
        }
        await baseStore.executeSql(sql);
      },
      recordMigration: async (version: string, checksum: string, batch: number) => {
        await baseStore.recordMigration(version, checksum, batch);
        const filename = currentFile ? currentFile.filename : `${version}.sql`;
        process.stdout.write(`[APPLIED] ${filename} (batch=${batch})\n`);
        pendingIndex++;
        currentFile = null;
      },
    };

    const runner = new Migrator({
      migrationsDir: MIGRATIONS_DIR,
      store: trackedStore,
      schemaVerified: true,
    });

    try {
      const result = await runner.applyPending();
      process.stdout.write(
        `\n[MIGRATE:UP] Completed batch ${result.batch}: applied ${result.appliedVersions.length} migration(s).\n`
      );
    } catch (err) {
      const failedName = currentFile ? (currentFile as MigrationFile).filename : 'unknown';
      process.stderr.write(`[FAILED]  ${failedName}: ${formatMysqlError(err)}\n`);
      process.exitCode = 1;
    }
  } catch (err) {
    process.stderr.write(`[MIGRATE:ERROR] ${formatMysqlError(err)}\n`);
    process.exitCode = 1;
  } finally {
    await pool.end().catch(() => {});
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === path.resolve(__filename)) {
  runCli();
}
