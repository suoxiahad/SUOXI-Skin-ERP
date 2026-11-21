import type { PoolClient } from 'pg';

export interface CodeSequenceRow {
  current_number: number;
  prefix: string;
  padding: number;
}

export interface SequenceConfig {
  prefix: string;
  padding?: number;
}

const DEFAULT_CONFIGS: Record<string, SequenceConfig> = {
  PATIENT: { prefix: 'PAT-', padding: 5 },
  INVOICE: { prefix: 'INV-', padding: 6 },
  RECEIPT: { prefix: 'RCP-', padding: 6 },
  RX: { prefix: 'RX-', padding: 6 },
  REFUND: { prefix: 'REF-', padding: 5 },
  APPOINTMENT: { prefix: 'APT-', padding: 6 },
};

/**
 * Concurrency-safe, transactional, gap-free code generator for PostgreSQL.
 * Uses SELECT ... FOR UPDATE inside caller's transaction to ensure strict serialization.
 */
export async function nextCode(
  client: PoolClient,
  seqKey: string,
  periodKey = ''
): Promise<string> {
  const normalizedSeq = seqKey.toUpperCase();
  const defaultConfig = DEFAULT_CONFIGS[normalizedSeq] || { prefix: `${normalizedSeq}-`, padding: 5 };

  const res = await client.query<CodeSequenceRow>(
    'SELECT current_number, prefix, padding FROM code_sequences WHERE sequence_key = $1 AND period_key = $2 FOR UPDATE',
    [normalizedSeq, periodKey]
  );

  let nextNum: number;
  let prefix: string;
  let padding: number;

  if (res.rows.length > 0) {
    const current = res.rows[0];
    nextNum = Number(current.current_number) + 1;
    prefix = current.prefix || defaultConfig.prefix;
    padding = current.padding || (defaultConfig.padding ?? 5);

    await client.query(
      'UPDATE code_sequences SET current_number = $1, updated_at = NOW() WHERE sequence_key = $2 AND period_key = $3',
      [nextNum, normalizedSeq, periodKey]
    );
  } else {
    nextNum = 1;
    prefix = defaultConfig.prefix;
    padding = defaultConfig.padding ?? 5;

    await client.query(
      'INSERT INTO code_sequences (sequence_key, period_key, prefix, current_number, padding) VALUES ($1, $2, $3, $4, $5)',
      [normalizedSeq, periodKey, prefix, nextNum, padding]
    );
  }

  const paddedNumber = String(nextNum).padStart(padding, '0');
  const periodSegment = periodKey ? `${periodKey}-` : '';

  return `${prefix}${periodSegment}${paddedNumber}`;
}
