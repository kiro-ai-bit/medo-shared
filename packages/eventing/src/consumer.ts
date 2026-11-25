import { resolveDb } from './worker.js';
import { createPollLoop } from './worker.js';
import { parseBrokerEvent, EVENT_TYPES, type BrokerEvent, type EventType } from './events.js';
import type { Logger, Queryable } from './types.js';
import { noopLogger } from './types.js';

export interface ConsumerTickResult {
  processed: number;
  skipped: number;
  failed: number;
  deadLettered: number;
}

export interface ConsumerHandle {
  tick: () => Promise<ConsumerTickResult>;
  stop: () => Promise<void>;
}

export interface ConsumerWorkerOptions {
  service: Queryable;
  broker: Queryable | string;
  consumer: string;
  subscribe?: readonly EventType[];
  dispatch: (event: BrokerEvent) => Promise<void>;
  pollIntervalMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  maxBackoffMs?: number;
  logger?: Logger;
  autoStart?: boolean;
}

interface BrokerRow {
  id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

const EMPTY_RESULT: ConsumerTickResult = { processed: 0, skipped: 0, failed: 0, deadLettered: 0 };

function errorMessage(err: unknown): string {
  return (err instanceof Error ? err.message : String(err)).slice(0, 4000);
}

export async function createConsumerWorker(opts: ConsumerWorkerOptions): Promise<ConsumerHandle> {
  const pollIntervalMs = opts.pollIntervalMs ?? 5000;
  const batchSize = opts.batchSize ?? 100;
  const maxAttempts = opts.maxAttempts ?? 5;
  const logger = opts.logger ?? noopLogger;
  const { db: broker, close } = resolveDb(opts.broker);

  const subscribed = new Set<string>(opts.subscribe ?? EVENT_TYPES);
  for (const t of subscribed) {
    if (!EVENT_TYPES.includes(t as EventType)) {
      throw new Error(`cannot subscribe to unknown event type: ${t}`);
    }
  }

  async function getOffset(): Promise<string> {
    const res = await opts.service.query<{ last_event_id: string }>(
      `SELECT last_event_id FROM consumer_offsets WHERE consumer_name = $1`,
      [opts.consumer],
    );
    return res.rows[0]?.last_event_id ?? '0';
  }

  async function advanceOffset(eventRowId: string): Promise<void> {
    await opts.service.query(
      `INSERT INTO consumer_offsets (consumer_name, last_event_id, updated_at)
       VALUES ($1, $2::bigint, now())
       ON CONFLICT (consumer_name) DO UPDATE
         SET last_event_id = GREATEST(consumer_offsets.last_event_id, EXCLUDED.last_event_id),
             updated_at = now()`,
      [opts.consumer, eventRowId],
    );
  }

  async function bumpAttempts(eventRowId: string, message: string): Promise<number> {
    const res = await broker.query<{ attempts: number }>(
      `INSERT INTO consumer_attempts (consumer_name, event_id, attempts, last_error, updated_at)
       VALUES ($1, $2::bigint, 1, $3, now())
       ON CONFLICT (consumer_name, event_id) DO UPDATE
         SET attempts = consumer_attempts.attempts + 1,
             last_error = EXCLUDED.last_error,
             updated_at = now()
       RETURNING attempts`,
      [opts.consumer, eventRowId, message],
    );
    return res.rows[0]!.attempts;
  }

  async function clearAttempts(eventRowId: string): Promise<void> {
    await broker.query(
      `DELETE FROM consumer_attempts WHERE consumer_name = $1 AND event_id = $2::bigint`,
      [opts.consumer, eventRowId],
    );
  }

  async function deadLetter(row: BrokerRow, message: string, attempts: number): Promise<void> {
    await broker.query(
      `INSERT INTO dead_letters (event_row_id, event_id, consumer_name, event_type, payload, last_error, attempts)
       VALUES ($1::bigint, $2, $3, $4, $5::jsonb, $6, $7)`,
      [
        row.id,
        row.event_id,
        opts.consumer,
        row.event_type,
        JSON.stringify(row.payload),
        message,
        attempts,
      ],
    );
    await advanceOffset(row.id);
    await clearAttempts(row.id);
  }

  async function recordFailure(
    row: BrokerRow,
    err: unknown,
    result: ConsumerTickResult,
  ): Promise<boolean> {
    const message = errorMessage(err);
    const attempts = await bumpAttempts(row.id, message);
    result.failed += 1;
    if (attempts >= maxAttempts) {
      await deadLetter(row, message, attempts);
      result.deadLettered += 1;
      return true;
    }
    return false;
  }

  async function tick(): Promise<ConsumerTickResult> {
    const result: ConsumerTickResult = { ...EMPTY_RESULT };
    const offset = await getOffset();
    const rows = await broker.query<BrokerRow>(
      `SELECT id, event_id, event_type, payload, occurred_at FROM events WHERE id > $1::bigint ORDER BY id LIMIT $2`,
      [offset, batchSize],
    );
    for (const row of rows.rows) {
      if (!subscribed.has(row.event_type)) {
        await advanceOffset(row.id);
        result.skipped += 1;
        continue;
      }
      let event: BrokerEvent;
      try {
        event = parseBrokerEvent(row.payload, row.id);
      } catch (err) {
        if (!(await recordFailure(row, err, result))) break;
        continue;
      }
      try {
        await opts.dispatch(event);
        await advanceOffset(row.id);
        await clearAttempts(row.id);
        result.processed += 1;
      } catch (err) {
        if (!(await recordFailure(row, err, result))) break;
      }
    }
    return result;
  }

  const loop = createPollLoop({
    label: `eventing consumer ${opts.consumer}`,
    intervalMs: pollIntervalMs,
    maxBackoffMs: opts.maxBackoffMs,
    logger,
    tick,
    autoStart: opts.autoStart,
  });

  return {
    tick: async () => {
      try {
        return await tick();
      } catch (err) {
        logger.error?.('eventing consumer tick failed', {
          consumer: opts.consumer,
          error: errorMessage(err),
        });
        return { ...EMPTY_RESULT };
      }
    },
    stop: async () => {
      await loop.stop();
      await close();
    },
  };
}
