import { randomUUID } from 'node:crypto';
import type { Queryable } from './types.js';
import { assertTableName } from './worker.js';

export interface OutboxEventInput {
  type: string;
  payload: Record<string, unknown>;
  eventId?: string;
  occurredAt?: string;
}

export interface AppendOutboxOptions {
  tableName?: string;
}

export async function appendOutbox(
  tx: Queryable,
  input: OutboxEventInput,
  opts: AppendOutboxOptions = {},
): Promise<string> {
  const table = opts.tableName ?? 'outbox';
  assertTableName(table);
  const occurredAt =
    typeof input.payload.occurredAt === 'string'
      ? input.payload.occurredAt
      : (input.occurredAt ?? new Date().toISOString());
  const eventId = input.eventId ?? randomUUID();
  const flat: Record<string, unknown> = {
    ...input.payload,
    eventId,
    type: input.type,
    occurredAt,
  };
  await tx.query(
    `INSERT INTO ${table} (event_id, event_type, payload, occurred_at) VALUES ($1, $2, $3::jsonb, $4)`,
    [eventId, input.type, JSON.stringify(flat), occurredAt],
  );
  return eventId;
}
