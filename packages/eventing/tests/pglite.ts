import { PGlite } from '@electric-sql/pglite';
import { ensureConsumerOffsetsSchema, type Queryable } from '../src/index.js';

export interface TestDbs {
  service: Queryable;
  broker: Queryable;
  servicePg: PGlite;
  brokerPg: PGlite;
  close: () => Promise<void>;
}

function wrap(pg: PGlite): Queryable {
  return {
    async query<T = Record<string, unknown>>(text: string, params: readonly unknown[] = []) {
      const res = await pg.query<T>(text, params as unknown[]);
      return { rows: res.rows };
    },
  };
}

export async function createTestDbs(): Promise<TestDbs> {
  const servicePg = new PGlite();
  const brokerPg = new PGlite();
  const service = wrap(servicePg);
  await ensureConsumerOffsetsSchema(service);
  return {
    service,
    broker: wrap(brokerPg),
    servicePg,
    brokerPg,
    close: async () => {
      await servicePg.close();
      await brokerPg.close();
    },
  };
}
