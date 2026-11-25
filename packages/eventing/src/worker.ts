import { connectPostgres, asQueryable } from './connect.js';
import type { Logger, Queryable } from './types.js';
import { noopLogger } from './types.js';

export function resolveDb(target: Queryable | string): {
  db: Queryable;
  close: () => Promise<void>;
} {
  if (typeof target === 'string') {
    const pool = connectPostgres(target);
    return { db: asQueryable(pool), close: () => pool.end() };
  }
  return { db: target, close: async () => {} };
}

export function assertTableName(name: string): void {
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) {
    throw new Error(`invalid table name: ${name}`);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface PollLoop {
  pending: () => Promise<unknown> | undefined;
  stop: () => Promise<void>;
}

export function createPollLoop(opts: {
  label: string;
  intervalMs: number;
  maxBackoffMs?: number;
  logger?: Logger;
  tick: () => Promise<unknown>;
  autoStart?: boolean;
}): PollLoop {
  const logger = opts.logger ?? noopLogger;
  const maxBackoffMs = opts.maxBackoffMs ?? 60000;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<unknown> | undefined;
  let failures = 0;

  function schedule(delayMs: number): void {
    if (stopped) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void cycle(), delayMs);
    timer.unref?.();
  }

  async function cycle(): Promise<void> {
    if (stopped || inFlight) return;
    inFlight = opts
      .tick()
      .then(() => {
        failures = 0;
        schedule(opts.intervalMs);
      })
      .catch((err) => {
        failures += 1;
        const delay = Math.min(opts.intervalMs * 2 ** failures, maxBackoffMs);
        logger.error?.(`${opts.label} tick failed`, {
          error: errorMessage(err),
          nextDelayMs: delay,
        });
        schedule(delay);
      })
      .finally(() => {
        inFlight = undefined;
      });
    await inFlight;
  }

  if (opts.autoStart !== false) {
    schedule(0);
  }

  return {
    pending: () => inFlight,
    stop: async () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (inFlight) await inFlight;
    },
  };
}
