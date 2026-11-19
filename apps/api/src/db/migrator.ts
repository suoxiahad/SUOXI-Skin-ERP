import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import type { Pool, PoolConnection } from 'mysql2/promise';
import { logger } from '../logger/logger.js';

export interface MigrationFile {
  version: string;
  filename: string;
  fullPath: string;
  checksum: string;
  content: string;
}

export interface AppliedMigration {
  id: number;
  version: string;
  checksum: string;
  batch: number;
  applied_at: Date | string;
}

export interface MigrationPlan {
  totalFiles: number;
  appliedCount: number;
  pendingCount: number;
  applied: AppliedMigration[];
  pending: MigrationFile[];
}

export class MigrationChecksumMismatchError extends Error {
  constructor(
    public readonly version: string,
    public readonly recordedChecksum: string,
    public readonly currentChecksum: string
  ) {
    super(
      `Migration checksum mismatch for "${version}"! Recorded: ${recordedChecksum}, Current: ${currentChecksum}. Aborting to protect database integrity.`
    );
    this.name = 'MigrationChecksumMismatchError';
  }
}

export class SchemaGateBlockedError extends Error {
  constructor(message = 'SCHEMA GATE (Rule 11): Cannot apply migrations without verified schema approval') {
    super(message);
    this.name = 'SchemaGateBlockedError';
  }
}

export function computeSha256(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && !f.startsWith('.'))
    .sort();

  return files.map((filename) => {
    const fullPath = path.join(migrationsDir, filename);
    const content = fs.readFileSync(fullPath, 'utf8');
    const checksum = computeSha256(content);
    const version = filename.replace(/\.sql$/, '');

    return {
      version,
      filename,
      fullPath,
      checksum,
      content,
    };
  });
}

/**
 * Interface for database interactions to allow safe dry-runs and unit testing without live MySQL DDL.
 */
export interface MigrationStore {
  ensureTrackingTable(): Promise<void>;
  getAppliedMigrations(): Promise<AppliedMigration[]>;
  recordMigration(version: string, checksum: string, batch: number): Promise<void>;
  executeSql(sql: string): Promise<void>;
}

/**
 * In-memory test store double for validating migration runner logic without touching any real database.
 */
export class InMemoryMigrationStore implements MigrationStore {
  private applied: AppliedMigration[] = [];
  public trackingTableCreated = false;

  async ensureTrackingTable(): Promise<void> {
    this.trackingTableCreated = true;
  }

  async getAppliedMigrations(): Promise<AppliedMigration[]> {
    return [...this.applied];
  }

  async recordMigration(version: string, checksum: string, batch: number): Promise<void> {
    this.applied.push({
      id: this.applied.length + 1,
      version,
      checksum,
      batch,
      applied_at: new Date().toISOString(),
    });
  }

  async executeSql(_sql: string): Promise<void> {
    // Simulated execution
  }
}

export class Migrator {
  private migrationsDir: string;
  private store: MigrationStore;
  private schemaVerified: boolean;

  constructor(options: {
    migrationsDir: string;
    store: MigrationStore;
    schemaVerified?: boolean;
  }) {
    this.migrationsDir = options.migrationsDir;
    this.store = options.store;
    this.schemaVerified = options.schemaVerified ?? false;
  }

  /**
   * Plans migrations without applying any changes.
   * Compares directory files with applied records and verifies checksums.
   */
  async plan(): Promise<MigrationPlan> {
    await this.store.ensureTrackingTable();
    const diskFiles = loadMigrationFiles(this.migrationsDir);
    const applied = await this.store.getAppliedMigrations();

    const appliedMap = new Map<string, AppliedMigration>();
    for (const app of applied) {
      appliedMap.set(app.version, app);
    }

    const pending: MigrationFile[] = [];

    for (const file of diskFiles) {
      const existing = appliedMap.get(file.version);
      if (existing) {
        if (existing.checksum !== file.checksum) {
          throw new MigrationChecksumMismatchError(
            file.version,
            existing.checksum,
            file.checksum
          );
        }
      } else {
        pending.push(file);
      }
    }

    return {
      totalFiles: diskFiles.length,
      appliedCount: applied.length,
      pendingCount: pending.length,
      applied,
      pending,
    };
  }

  /**
   * Applies pending migrations.
   * STRICT ENFORCEMENT: If schemaVerified is false, refuses to execute DDL (Rule 11).
   */
  async applyPending(): Promise<{ appliedVersions: string[]; batch: number }> {
    if (!this.schemaVerified) {
      throw new SchemaGateBlockedError();
    }

    const plan = await this.plan();
    if (plan.pendingCount === 0) {
      return { appliedVersions: [], batch: 0 };
    }

    const nextBatch = (plan.applied.reduce((max, m) => Math.max(max, m.batch), 0) || 0) + 1;
    const appliedVersions: string[] = [];

    for (const file of plan.pending) {
      logger.info({ version: file.version, checksum: file.checksum }, 'Applying database migration');
      await this.store.executeSql(file.content);
      await this.store.recordMigration(file.version, file.checksum, nextBatch);
      appliedVersions.push(file.version);
    }

    return {
      appliedVersions,
      batch: nextBatch,
    };
  }
}
