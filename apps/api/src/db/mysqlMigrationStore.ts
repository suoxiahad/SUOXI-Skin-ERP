import mysql, { Pool, PoolOptions, RowDataPacket } from 'mysql2/promise';
import type { AppliedMigration, MigrationStore } from './migrator.js';
import { getPoolConfig } from './pool.js';

interface SchemaMigrationRow extends RowDataPacket {
  id: number;
  version: string;
  checksum: string;
  batch: number;
  applied_at: Date | string;
}

/**
 * Creates a dedicated MySQL connection pool for migrations with `multipleStatements: true`
 * enabled, isolated from the runtime application pool.
 */
export function createMigrationPool(): Pool {
  const baseConfig = getPoolConfig() as PoolOptions & { uri?: string };

  if (baseConfig.uri) {
    return mysql.createPool({
      ...baseConfig,
      uri: baseConfig.uri,
      multipleStatements: true,
    });
  }

  return mysql.createPool({
    ...baseConfig,
    multipleStatements: true,
  });
}

/**
 * Splits a SQL migration script into executable statements, supporting:
 * - Client-side `DELIMITER <token>` directives (e.g. `DELIMITER $$`, `DELIMITER //`, `DELIMITER ;`)
 *   used by trigger definitions in MySQL migrations.
 * - Single-line (`-- `, `#`) and block comments without breaking string literals.
 * - Single-quoted, double-quoted, and backtick-quoted strings with escapes.
 */
export function splitSqlStatements(sql: string): string[] {
  const normalized = sql.replace(/\r\n/g, '\n');
  const statements: string[] = [];
  let delimiter = ';';
  let current = '';

  let i = 0;
  const len = normalized.length;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let inLineComment = false;
  let inBlockComment = false;

  const pushCurrent = (activeDelimiter: string) => {
    let trimmed = current.trim();
    if (!trimmed) {
      current = '';
      return;
    }

    // Strip any leading/inline empty lines that are pure comments so we don't send empty queries
    const withoutComments = stripStandaloneComments(trimmed);
    if (!withoutComments) {
      current = '';
      return;
    }

    // If a trigger used custom delimiter (e.g. //) and wrote `END;` right before `//`,
    // strip the redundant trailing semicolon inside single-statement trigger DDL.
    if (activeDelimiter !== ';' && /\bEND\s*;$/i.test(trimmed)) {
      trimmed = trimmed.replace(/;$/, '');
    }

    statements.push(trimmed);
    current = '';
  };

  while (i < len) {
    const ch = normalized[i];
    const next = i + 1 < len ? normalized[i + 1] : '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') {
        inLineComment = false;
      }
      i++;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        inBlockComment = false;
        i += 2;
      } else {
        i++;
      }
      continue;
    }

    if (inSingleQuote) {
      current += ch;
      if (ch === '\\' && i + 1 < len) {
        current += normalized[i + 1];
        i += 2;
        continue;
      }
      if (ch === "'" && next === "'") {
        current += next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        inSingleQuote = false;
      }
      i++;
      continue;
    }

    if (inDoubleQuote) {
      current += ch;
      if (ch === '\\' && i + 1 < len) {
        current += normalized[i + 1];
        i += 2;
        continue;
      }
      if (ch === '"' && next === '"') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '"') {
        inDoubleQuote = false;
      }
      i++;
      continue;
    }

    if (inBacktick) {
      current += ch;
      if (ch === '`' && next === '`') {
        current += next;
        i += 2;
        continue;
      }
      if (ch === '`') {
        inBacktick = false;
      }
      i++;
      continue;
    }

    // Check for line start DELIMITER directive (only when outside strings/comments and no pending code on this line)
    if (i === 0 || normalized[i - 1] === '\n') {
      const lineEndIdx = normalized.indexOf('\n', i);
      const rawLine = lineEndIdx === -1 ? normalized.slice(i) : normalized.slice(i, lineEndIdx);
      const delimMatch = rawLine.match(/^\s*DELIMITER\s+(\S+)\s*$/i);
      if (delimMatch) {
        if (stripStandaloneComments(current)) {
          pushCurrent(delimiter);
        } else {
          current = '';
        }
        delimiter = delimMatch[1];
        i = lineEndIdx === -1 ? len : lineEndIdx + 1;
        continue;
      }
    }

    // Comment starts
    if (ch === '-' && next === '-' && (i + 2 >= len || /\s/.test(normalized[i + 2]))) {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === '#') {
      inLineComment = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlockComment = true;
      current += '/*';
      i += 2;
      continue;
    }

    // String / identifier starts
    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inDoubleQuote = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === '`') {
      inBacktick = true;
      current += ch;
      i++;
      continue;
    }

    // Delimiter match
    if (normalized.startsWith(delimiter, i)) {
      pushCurrent(delimiter);
      i += delimiter.length;
      continue;
    }

    current += ch;
    i++;
  }

  pushCurrent(delimiter);
  return statements;
}

function stripStandaloneComments(sql: string): string {
  return sql
    .split('\n')
    .map((line) => {
      const t = line.trim();
      if (t.startsWith('--') || t.startsWith('#')) return '';
      return t;
    })
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();
}

export class MySqlMigrationStore implements MigrationStore {
  constructor(private readonly pool: Pool) {}

  async ensureTrackingTable(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        version VARCHAR(255) NOT NULL UNIQUE,
        checksum CHAR(64) NOT NULL COMMENT 'SHA-256 hash of migration file content',
        batch INT UNSIGNED NOT NULL DEFAULT 1,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_schema_migrations_applied (applied_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  async getAppliedMigrations(): Promise<AppliedMigration[]> {
    const [rows] = await this.pool.query<SchemaMigrationRow[]>(
      'SELECT id, version, checksum, batch, applied_at FROM schema_migrations ORDER BY id ASC'
    );

    return rows.map((row) => ({
      id: Number(row.id),
      version: String(row.version),
      checksum: String(row.checksum),
      batch: Number(row.batch),
      applied_at: row.applied_at,
    }));
  }

  async recordMigration(version: string, checksum: string, batch: number): Promise<void> {
    await this.pool.query(
      'INSERT INTO schema_migrations (version, checksum, batch) VALUES (?, ?, ?)',
      [version, checksum, batch]
    );
  }

  async executeSql(sql: string): Promise<void> {
    const statements = splitSqlStatements(sql);
    if (statements.length === 0) {
      return;
    }

    const conn = await this.pool.getConnection();
    try {
      for (const stmt of statements) {
        await conn.query(stmt);
      }
    } finally {
      conn.release();
    }
  }
}
