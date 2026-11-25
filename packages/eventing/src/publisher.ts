import { assertTableName, createPollLoop, resolveDb } from './worker.js';
import type { Logger, Queryable } from './types.js';
import { noopLogger } from './types.js';

export interface PublisherHandle {
  tick: () => Promise<number>;
  stop: () => Promise<void>;
}

export interface PublisherWorkerOptions {
  source: Queryable;
  broker: Queryable | string;
  sourceTable?: string;
  pollIntervalMs?: number;
  batchSize?: number;
  maxBackoffMs?: number;
  logger?: Logger;
  autoStart?: boolean;
}

interface OutboxRow {
  id: string;
  event_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  occurred_at: string;
}

export async function createPublisherWorker(
  opts: PublisherWorkerOptions,
): Promise<PublisherHandle> {
  const table = opts.sourceTable ?? 'outbox';
  assertTableName(table);
  const pollIntervalMs = opts.pollIntervalMs ?? 5000;
  const batchSize = opts.batchSize ?? 100;
  const logger = opts.logger ?? noopLogger;
  const { db: broker, close } = resolveDb(opts.broker);

  async function tick(): Promise<number> {
    const rows = await opts.source.query<OutboxRow>(
      `SELECT id, event_id, event_type, payload, occurred_at FROM ${table} ORDER BY id LIMIT $1`,
      [batchSize],
    );
    if (rows.rows.length === 0) return 0;
    const ids = rows.rows.map((r) => r.id);
    for (const row of rows.rows) {
      await broker.query(
        `INSERT INTO events (event_id, event_type, payload, occurred_at)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (event_id) DO NOTHING`,
        [row.event_id, row.event_type, JSON.stringify(row.payload), row.occurred_at],
      );
    }
    await opts.source.query(`DELETE FROM ${table} WHERE id = ANY($1::bigint[])`, [ids]);
    return rows.rows.length;
  }

  const loop = createPollLoop({
    label: 'eventing publisher',
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
        logger.error?.('eventing publisher tick failed', {
          error: err instanceof Error ? err.message : String(err),
        });
        return -1;
      }
    },
    stop: async () => {
      await loop.stop();
      await close();
    },
  };
}
