import type { Queryable } from './types.js';
import { assertTableName } from './worker.js';

export const CONSUMER_OFFSETS_DDL = `
CREATE TABLE IF NOT EXISTS consumer_offsets (
  consumer_name text PRIMARY KEY,
  last_event_id bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
)`;

export async function ensureConsumerOffsetsSchema(db: Queryable): Promise<void> {
  await db.query(CONSUMER_OFFSETS_DDL);
}

export const OUTBOX_DDL = `
CREATE TABLE IF NOT EXISTS outbox (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`;

export const BROKER_EVENTS_DDL = `
CREATE TABLE IF NOT EXISTS events (
  id bigserial PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
)`;

export const DEAD_LETTERS_DDL = `
CREATE TABLE IF NOT EXISTS dead_letters (
  id bigserial PRIMARY KEY,
  event_row_id bigint,
  event_id uuid NOT NULL,
  consumer_name text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  last_error text NOT NULL,
  attempts integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  replayed_at timestamptz
)`;

export const CONSUMER_ATTEMPTS_DDL = `
CREATE TABLE IF NOT EXISTS consumer_attempts (
  consumer_name text NOT NULL,
  event_id bigint NOT NULL,
  attempts integer NOT NULL,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_name, event_id)
)`;

export async function ensureOutboxSchema(
  db: Queryable,
  opts: { tableName?: string } = {},
): Promise<void> {
  const table = opts.tableName ?? 'outbox';
  assertTableName(table);
  const ddl = OUTBOX_DDL.replace(/outbox/g, table);
  await db.query(ddl);
}

export async function ensureBrokerSchema(db: Queryable): Promise<void> {
  await db.query(BROKER_EVENTS_DDL);
  await db.query(DEAD_LETTERS_DDL);
  await db.query(CONSUMER_ATTEMPTS_DDL);
}

export async function ensureEventingSchema(deps: {
  service?: Queryable;
  broker: Queryable;
  outboxTable?: string;
}): Promise<void> {
  if (deps.service) {
    await ensureOutboxSchema(deps.service, { tableName: deps.outboxTable });
  }
  await ensureBrokerSchema(deps.broker);
}
