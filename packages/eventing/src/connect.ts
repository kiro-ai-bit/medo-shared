import pg from 'pg';
import type { Queryable } from './types.js';

export function connectPostgres(dsn: string): pg.Pool {
  return new pg.Pool({ connectionString: dsn });
}

export function asQueryable(client: {
  query: (text: string, params?: readonly unknown[]) => Promise<{ rows: unknown[] }>;
}): Queryable {
  return {
    query: async <T = Record<string, unknown>>(text: string, params: readonly unknown[] = []) => {
      const res = await client.query(text, params);
      return { rows: res.rows as T[] };
    },
  };
}
