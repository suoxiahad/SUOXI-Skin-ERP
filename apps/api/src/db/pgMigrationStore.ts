import pg, { type Pool } from 'pg';
import { getConfig } from '../config/env.js';
import type { AppliedMigration, MigrationStore } from './migrator.js';

const { Pool: PgPool } = pg;

export function createMigrationPool(): Pool {
  const config = getConfig();
  if (
    config.DATABASE_URL &&
    (config.DATABASE_URL.startsWith('postgresql://') || config.DATABASE_URL.startsWith('postgres://'))
  ) {
    return new PgPool({
      connectionString: config.DATABASE_URL,
      max: 5,
      connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
    });
  }

  return new PgPool({
    host: config.DB_HOST,
    port: config.DB_PORT,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    max: 5,
    connectionTimeoutMillis: config.DB_CONNECTION_TIMEOUT_MS,
  });
}

export class PgMigrationStore implements MigrationStore {
  constructor(private readonly pool: Pool) {}

  async ensureTrackingTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum VARCHAR(64) NOT NULL,
        batch INTEGER NOT NULL DEFAULT 1,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  }

  async getAppliedMigrations(): Promise<AppliedMigration[]> {
    const res = await this.pool.query<{
      filename: string;
      checksum: string;
      batch?: number;
      applied_at: string;
    }>('SELECT filename, checksum, applied_at FROM schema_migrations ORDER BY filename ASC');
    return res.rows.map((r, idx) => ({
      id: idx + 1,
      version: r.filename.replace(/\.sql$/, ''),
      checksum: r.checksum,
      batch: r.batch ?? 1,
      applied_at: r.applied_at,
    }));
  }

  async recordMigration(version: string, checksum: string, _batch: number): Promise<void> {
    const filename = version.endsWith('.sql') ? version : `${version}.sql`;
    await this.pool.query(
      'INSERT INTO schema_migrations (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING',
      [filename, checksum]
    );
  }

  async executeSql(sql: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
