import { randomUUID } from 'node:crypto';
import { assertTableName } from './worker.js';
import type { Queryable } from './types.js';

export interface DeadLetterRow {
  id: string;
  event_row_id: string | null;
  event_id: string;
  consumer_name: string;
  event_type: string;
  payload: Record<string, unknown>;
  last_error: string;
  attempts: number;
  created_at: string;
  replayed_at: string | null;
}

export async function listDeadLetters(
  db: Queryable,
  opts: { limit?: number; consumer?: string; unreplayedOnly?: boolean } = {},
): Promise<DeadLetterRow[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (opts.consumer) {
    params.push(opts.consumer);
    conditions.push(`consumer_name = $${params.length}`);
  }
  if (opts.unreplayedOnly) {
    conditions.push(`replayed_at IS NULL`);
  }
  params.push(opts.limit ?? 50);
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const res = await db.query<DeadLetterRow>(
    `SELECT * FROM dead_letters ${where} ORDER BY id DESC LIMIT $${params.length}`,
    params,
  );
  return res.rows;
}

export async function countDeadLetters(
  db: Queryable,
  opts: { unreplayedOnly?: boolean } = {},
): Promise<number> {
  const res = await db.query<{ c: number }>(
    `SELECT count(*)::int AS c FROM dead_letters ${opts.unreplayedOnly ? 'WHERE replayed_at IS NULL' : ''}`,
  );
  return res.rows[0]!.c;
}

export async function replayDeadLetter(db: Queryable, deadLetterId: string): Promise<string> {
  const res = await db.query<DeadLetterRow>(`SELECT * FROM dead_letters WHERE id = $1::bigint`, [
    deadLetterId,
  ]);
  const dl = res.rows[0];
  if (!dl) throw new Error(`dead letter not found: ${deadLetterId}`);
  const newEventId = randomUUID();
  const payload = { ...dl.payload, eventId: newEventId };
  const ins = await db.query<{ id: string }>(
    `INSERT INTO events (event_id, event_type, payload, occurred_at)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id`,
    [newEventId, dl.event_type, JSON.stringify(payload), dl.created_at],
  );
  await db.query(`UPDATE dead_letters SET replayed_at = now() WHERE id = $1::bigint`, [
    deadLetterId,
  ]);
  return String(ins.rows[0]!.id);
}

export async function countOutboxBacklog(db: Queryable, tableName = 'outbox'): Promise<number> {
  assertTableName(tableName);
  const res = await db.query<{ c: number }>(`SELECT count(*)::int AS c FROM ${tableName}`);
  return res.rows[0]!.c;
}
