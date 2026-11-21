import type { PoolClient } from 'pg';

export interface AuditParams {
  actorUserId: string | number;
  action: string;
  entityType: string;
  entityId: string | number;
  patientId?: string | number | null;
  branchId?: string | number | null;
  reason?: string | null;
  payloadBefore?: unknown;
  payloadAfter?: unknown;
  ipAddress: string;
  userAgent?: string | null;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'pass',
  'token',
  'secret',
  'authorization',
  'credit_card',
  'pin',
  'apikey',
  'jwt',
  'nid',
]);

export function stripSecrets(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => stripSecrets(item));
  }

  const cleaned: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes('password') || lowerKey.includes('secret')) {
      cleaned[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      cleaned[key] = stripSecrets(val);
    } else {
      cleaned[key] = val;
    }
  }

  return cleaned;
}

export interface AuditStore {
  recordAudit(params: AuditParams): Promise<void>;
}

export class InMemoryAuditStore implements AuditStore {
  private events: AuditParams[] = [];

  async recordAudit(params: AuditParams): Promise<void> {
    this.events.push({
      ...params,
      payloadBefore: stripSecrets(params.payloadBefore),
      payloadAfter: stripSecrets(params.payloadAfter),
    });
  }

  getEvents(): AuditParams[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

let activeAuditStore: AuditStore = new InMemoryAuditStore();

export function setAuditStore(store: AuditStore): void {
  activeAuditStore = store;
}

export function getAuditStore(): AuditStore {
  return activeAuditStore;
}

/**
 * Transactional audit logger that sanitizes payloads by stripping secrets
 * before writing to audit_events (PostgreSQL).
 */
export async function logAudit(
  conn: PoolClient | null,
  params: AuditParams
): Promise<void> {
  const sanitizedBefore = params.payloadBefore ? JSON.stringify(stripSecrets(params.payloadBefore)) : null;
  const sanitizedAfter = params.payloadAfter ? JSON.stringify(stripSecrets(params.payloadAfter)) : null;

  if (conn) {
    await conn.query(
      `INSERT INTO audit_events (
        actor_user_id, action, entity_type, entity_id, patient_id, branch_id,
        reason, payload_before, payload_after, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)`,
      [
        params.actorUserId,
        params.action,
        params.entityType,
        String(params.entityId),
        params.patientId || null,
        params.branchId || null,
        params.reason || null,
        sanitizedBefore,
        sanitizedAfter,
        params.ipAddress,
        params.userAgent || null,
      ]
    );
  } else {
    await activeAuditStore.recordAudit(params);
  }
}
