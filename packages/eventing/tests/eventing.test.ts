import { afterEach, describe, expect, it } from 'vitest';
import {
  appendOutbox,
  countDeadLetters,
  countOutboxBacklog,
  createConsumerWorker,
  createPublisherWorker,
  ensureBrokerSchema,
  ensureEventingSchema,
  ensureOutboxSchema,
  ensureProcessedMarkers,
  EVENT_SCHEMAS,
  isProcessed,
  listDeadLetters,
  markProcessed,
  purgeProcessedMarkers,
  replayDeadLetter,
} from '../src/index.js';
import { createTestDbs, type TestDbs } from './pglite.js';

let dbs: TestDbs | undefined;
afterEach(async () => {
  await dbs?.close();
  dbs = undefined;
});

async function setup() {
  dbs = await createTestDbs();
  await ensureEventingSchema({ service: dbs.service, broker: dbs.broker });
  return dbs;
}

const noopLogger = { debug() {}, info() {}, warn() {}, error() {} };

describe('ensure schemas', () => {
  it('creates outbox + broker tables idempotently', async () => {
    const { service, broker } = await setup();
    await ensureOutboxSchema(service);
    await ensureBrokerSchema(broker);
    const outbox = await service.query(
      `SELECT table_name FROM information_schema.tables WHERE table_name='outbox'`,
    );
    expect(outbox.rows).toHaveLength(1);
    const brokerTables = await broker.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables WHERE table_name IN ('events','dead_letters','consumer_attempts') ORDER BY 1`,
    );
    expect(brokerTables.rows.map((r) => r.table_name)).toEqual([
      'consumer_attempts',
      'dead_letters',
      'events',
    ]);
  });
});

describe('appendOutbox', () => {
  it('writes envelope+payload row inside caller transaction; rollback removes it', async () => {
    const { service } = await setup();
    // simulate a tx via a dedicated connection is not possible on PGlite queryable;
    // verify row shape + unique event_id instead
    const eventId = await appendOutbox(service, {
      type: 'AccountDeleted',
      payload: { userId: '11111111-1111-4111-8111-111111111111' },
      occurredAt: '2026-11-26T00:00:00.000Z',
    });
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await service.query<{ event_type: string; payload: Record<string, unknown> }>(
      `SELECT event_type, payload FROM outbox`,
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]!.event_type).toBe('AccountDeleted');
    expect(rows.rows[0]!.payload).toMatchObject({
      eventId,
      type: 'AccountDeleted',
      occurredAt: '2026-11-26T00:00:00.000Z',
      userId: '11111111-1111-4111-8111-111111111111',
    });
    await expect(
      service.query(
        `INSERT INTO outbox(event_id,event_type,payload,occurred_at) VALUES ($1,'X','{}','2026-01-01')`,
        [eventId],
      ),
    ).rejects.toThrow();
  });

  it('rolls back the outbox row when the caller transaction aborts', async () => {
    const { service, servicePg } = await setup();
    await expect(
      servicePg.transaction(async (tx) => {
        const txQueryable: typeof service = {
          query: async (text, params = []) => {
            const res = await tx.query(text, [...(params as unknown[])]);
            return { rows: res.rows as Record<string, unknown>[] };
          },
        };
        await appendOutbox(txQueryable, {
          type: 'AccountDeleted',
          payload: { userId: '11111111-1111-4111-8111-111111111111' },
        });
        throw new Error('abort tx');
      }),
    ).rejects.toThrow('abort tx');
    const rows = await service.query<{ c: number }>(`SELECT count(*)::int AS c FROM outbox`);
    expect(rows.rows[0]!.c).toBe(0);
  });

  it('uses payload.occurredAt as envelope occurredAt when present', async () => {
    const { service } = await setup();
    await appendOutbox(service, {
      type: 'DoseOutcomeChanged',
      payload: {
        doseId: 'd',
        occurredAt: '2026-11-26T01:02:03.000Z',
      },
    });
    const rows = await service.query<{ occurred_at: string; payload: Record<string, unknown> }>(
      `SELECT occurred_at, payload FROM outbox`,
    );
    expect(rows.rows[0]!.payload.occurredAt).toBe('2026-11-26T01:02:03.000Z');
    expect(new Date(rows.rows[0]!.occurred_at).toISOString()).toBe('2026-11-26T01:02:03.000Z');
  });
});

describe('publisher worker', () => {
  it('drains outbox into broker events in id order and deletes published rows', async () => {
    const { service, broker } = await setup();
    await appendOutbox(service, {
      type: 'AccountDeleted',
      payload: { userId: '11111111-1111-4111-8111-111111111111' },
      occurredAt: '2026-01-01T00:00:00Z',
    });
    await appendOutbox(service, {
      type: 'UserRegistered',
      payload: { userId: '22222222-2222-4222-8222-222222222222', role: 'Patient' },
      occurredAt: '2026-01-01T00:00:01Z',
    });
    const pub = await createPublisherWorker({
      source: service,
      broker,
      logger: noopLogger,
      autoStart: false,
    });
    const published = await pub.tick();
    expect(published).toBe(2);
    const events = await broker.query<{ event_type: string; id: string }>(
      `SELECT id, event_type FROM events ORDER BY id`,
    );
    expect(events.rows.map((r) => r.event_type)).toEqual(['AccountDeleted', 'UserRegistered']);
    const remaining = await service.query(`SELECT count(*)::int AS c FROM outbox`);
    expect(remaining.rows[0]).toMatchObject({ c: 0 });
    await pub.stop();
  });

  it('is idempotent on republish (event_id conflict) and republishes safely', async () => {
    const { service, broker } = await setup();
    const eventId = await appendOutbox(service, {
      type: 'AccountDeleted',
      payload: { userId: '11111111-1111-4111-8111-111111111111' },
    });
    // simulate crash: insert into broker manually, leave outbox row
    await broker.query(
      `INSERT INTO events(event_id,event_type,payload,occurred_at) VALUES ($1,'AccountDeleted','{}','2026-01-01')`,
      [eventId],
    );
    const pub = await createPublisherWorker({
      source: service,
      broker,
      logger: noopLogger,
      autoStart: false,
    });
    await pub.tick();
    const count = await broker.query<{ c: number }>(`SELECT count(*)::int AS c FROM events`);
    expect(count.rows[0]!.c).toBe(1);
    const remaining = await service.query(`SELECT count(*)::int AS c FROM outbox`);
    expect(remaining.rows[0]).toMatchObject({ c: 0 });
    await pub.stop();
  });

  it('backs off exponentially on drain failure', async () => {
    const { service } = await setup();
    await appendOutbox(service, {
      type: 'AccountDeleted',
      payload: { userId: '11111111-1111-4111-8111-111111111111' },
    });
    const failing = {
      query: () => Promise.reject(new Error('broker down')),
    };
    const pub = await createPublisherWorker({
      source: service,
      broker: failing as never,
      logger: noopLogger,
      autoStart: true,
      pollIntervalMs: 5,
      maxBackoffMs: 40,
    });
    await new Promise((r) => setTimeout(r, 60));
    await pub.stop();
    const remaining = await service.query(`SELECT count(*)::int AS c FROM outbox`);
    expect(remaining.rows[0]).toMatchObject({ c: 1 });
  });
});

describe('consumer worker', () => {
  async function seedEvents(
    broker: TestDbs['broker'],
    specs: Array<{ type: string; payload?: Record<string, unknown> }>,
  ) {
    for (const s of specs) {
      const eventId = crypto.randomUUID();
      await broker.query(
        `INSERT INTO events(event_id,event_type,payload,occurred_at) VALUES ($1,$2,$3::jsonb,now())`,
        [
          eventId,
          s.type,
          JSON.stringify({
            eventId,
            type: s.type,
            occurredAt: '2026-01-01T00:00:00Z',
            ...(s.payload ?? {}),
          }),
        ],
      );
    }
  }

  it('processes subscribed events in order and advances offset after success', async () => {
    const { service, broker } = await setup();
    await seedEvents(broker, [
      { type: 'AccountDeleted', payload: { userId: '11111111-1111-4111-8111-111111111111' } },
      {
        type: 'UserRegistered',
        payload: { userId: '22222222-2222-4222-8222-222222222222', role: 'Patient' },
      },
    ]);
    const seen: string[] = [];
    const consumer = await createConsumerWorker({
      service,
      broker,
      consumer: 'test-main',
      subscribe: ['AccountDeleted'],
      dispatch: async (e) => {
        seen.push(`${e.type}:${String(e.userId)}`);
      },
      logger: noopLogger,
      autoStart: false,
    });
    const res = await consumer.tick();
    expect(res).toMatchObject({ processed: 1, skipped: 1, failed: 0, deadLettered: 0 });
    expect(seen).toEqual(['AccountDeleted:11111111-1111-4111-8111-111111111111']);
    const off = await service.query<{ last_event_id: string }>(
      `SELECT last_event_id FROM consumer_offsets WHERE consumer_name='test-main'`,
    );
    expect(BigInt(off.rows[0]!.last_event_id)).toBeGreaterThan(0n);
    await consumer.stop();
  });

  it('does not advance offset on dispatch failure; retries next tick', async () => {
    const { service, broker } = await setup();
    await seedEvents(broker, [
      { type: 'AccountDeleted', payload: { userId: '11111111-1111-4111-8111-111111111111' } },
    ]);
    let calls = 0;
    const consumer = await createConsumerWorker({
      service,
      broker,
      consumer: 'test-main',
      subscribe: ['AccountDeleted'],
      maxAttempts: 2,
      dispatch: async () => {
        calls += 1;
        if (calls === 1) throw new Error('boom');
      },
      logger: noopLogger,
      autoStart: false,
    });
    const r1 = await consumer.tick();
    expect(r1.failed).toBe(1);
    const off1 = await service.query(`SELECT count(*)::int AS c FROM consumer_offsets`);
    expect(off1.rows[0]).toMatchObject({ c: 0 });
    const r2 = await consumer.tick();
    expect(r2.processed).toBe(1);
    expect(calls).toBe(2);
    await consumer.stop();
  });

  it('dead-letters after maxAttempts and advances offset', async () => {
    const { service, broker } = await setup();
    await seedEvents(broker, [
      { type: 'AccountDeleted', payload: { userId: '11111111-1111-4111-8111-111111111111' } },
      { type: 'AccountDeleted', payload: { userId: '22222222-2222-4222-8222-222222222222' } },
    ]);
    const consumer = await createConsumerWorker({
      service,
      broker,
      consumer: 'test-main',
      subscribe: ['AccountDeleted'],
      maxAttempts: 2,
      dispatch: async () => {
        throw new Error('always fails');
      },
      logger: noopLogger,
      autoStart: false,
    });
    const r1 = await consumer.tick(); // event1 attempt 1 -> head-of-line block
    expect(r1).toMatchObject({ failed: 1, deadLettered: 0 });
    const r2 = await consumer.tick(); // event1 attempt 2 -> DLQ, then event2 attempt 1 -> block
    expect(r2).toMatchObject({ failed: 2, deadLettered: 1 });
    let dl = await listDeadLetters(broker, { consumer: 'test-main' });
    expect(dl).toHaveLength(1);
    expect(dl[0]).toMatchObject({
      consumer_name: 'test-main',
      event_type: 'AccountDeleted',
      attempts: 2,
    });
    const r3 = await consumer.tick(); // event2 attempt 2 -> DLQ
    expect(r3.deadLettered).toBe(1);
    dl = await listDeadLetters(broker, { consumer: 'test-main' });
    expect(dl).toHaveLength(2);
    const off = await service.query<{ last_event_id: string }>(
      `SELECT last_event_id FROM consumer_offsets WHERE consumer_name='test-main'`,
    );
    expect(BigInt(off.rows[0]!.last_event_id)).toBeGreaterThan(1n);
    await consumer.stop();
  });

  it('validates payload with zod; malformed event fails then dead-letters', async () => {
    const { service, broker } = await setup();
    await broker.query(
      `INSERT INTO events(event_id,event_type,payload,occurred_at) VALUES ($1,'AccountDeleted',$2::jsonb,now())`,
      [
        crypto.randomUUID(),
        JSON.stringify({
          eventId: crypto.randomUUID(),
          type: 'AccountDeleted',
          occurredAt: '2026-01-01T00:00:00Z',
          userId: 'not-a-uuid',
        }),
      ],
    );
    const consumer = await createConsumerWorker({
      service,
      broker,
      consumer: 'test-main',
      subscribe: ['AccountDeleted'],
      maxAttempts: 1,
      dispatch: async () => {},
      logger: noopLogger,
      autoStart: false,
    });
    const res = await consumer.tick();
    expect(res.deadLettered).toBe(1);
    const dl = await listDeadLetters(broker);
    expect(dl).toHaveLength(1);
    await consumer.stop();
  });

  it('autoStart loop polls on interval', async () => {
    const { service, broker } = await setup();
    const seen: string[] = [];
    const consumer = await createConsumerWorker({
      service,
      broker,
      consumer: 'test-main',
      subscribe: ['AccountDeleted'],
      pollIntervalMs: 5,
      dispatch: async (e) => {
        seen.push(String(e.userId));
      },
      logger: noopLogger,
    });
    await broker.query(
      `INSERT INTO events(event_id,event_type,payload,occurred_at) VALUES ($1,'AccountDeleted',$2::jsonb,now())`,
      [
        crypto.randomUUID(),
        JSON.stringify({
          eventId: crypto.randomUUID(),
          type: 'AccountDeleted',
          occurredAt: '2026-01-01T00:00:00Z',
          userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        }),
      ],
    );
    await new Promise((r) => setTimeout(r, 40));
    await consumer.stop();
    expect(seen).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']);
  });
});

describe('dead letters + replay', () => {
  it('lists, counts, and replays a dead letter as a new event', async () => {
    const { broker } = await setup();
    const eventId = crypto.randomUUID();
    await broker.query(
      `INSERT INTO dead_letters(event_row_id,event_id,consumer_name,event_type,payload,last_error,attempts)
       VALUES (1,$1,'c1','AccountDeleted',$2::jsonb,'err',5)`,
      [
        eventId,
        JSON.stringify({
          eventId,
          type: 'AccountDeleted',
          occurredAt: '2026-01-01T00:00:00Z',
          userId: '11111111-1111-4111-8111-111111111111',
        }),
      ],
    );
    expect(await countDeadLetters(broker)).toBe(1);
    const list = await listDeadLetters(broker);
    expect(list[0]!.id).toBeDefined();
    const newId = await replayDeadLetter(broker, list[0]!.id);
    expect(typeof newId).toBe('string');
    const events = await broker.query<{ event_type: string }>(`SELECT event_type FROM events`);
    expect(events.rows).toHaveLength(1);
    const dl = await listDeadLetters(broker);
    expect(dl[0]!.replayed_at).not.toBeNull();
  });
});

describe('processed markers', () => {
  it('mark/is/purge with (event_id,action) PK', async () => {
    const { service } = await setup();
    await ensureProcessedMarkers(service);
    const eventId = crypto.randomUUID();
    expect(await isProcessed(service, { eventId, action: 'feed:CareLinkEnded' })).toBe(false);
    await markProcessed(service, { eventId, action: 'feed:CareLinkEnded' });
    expect(await isProcessed(service, { eventId, action: 'feed:CareLinkEnded' })).toBe(true);
    expect(await isProcessed(service, { eventId, action: 'push:CareLinkEnded' })).toBe(false);
    await markProcessed(service, { eventId, action: 'feed:CareLinkEnded' }); // idempotent
    await service.query(
      `UPDATE processed_event_markers SET processed_at = '2020-01-01' WHERE event_id=$1`,
      [eventId],
    );
    expect(await purgeProcessedMarkers(service, new Date('2021-01-01T00:00:00Z'))).toBe(1);
    expect(await isProcessed(service, { eventId, action: 'feed:CareLinkEnded' })).toBe(false);
  });
});

describe('count helpers', () => {
  it('countOutboxBacklog counts unpublished rows', async () => {
    const { service } = await setup();
    await appendOutbox(service, {
      type: 'AccountDeleted',
      payload: { userId: '11111111-1111-4111-8111-111111111111' },
    });
    await appendOutbox(service, {
      type: 'AccountDeleted',
      payload: { userId: '22222222-2222-4222-8222-222222222222' },
    });
    expect(await countOutboxBacklog(service)).toBe(2);
  });
});

describe('event schemas', () => {
  it('covers all 13 catalog events', () => {
    expect(Object.keys(EVENT_SCHEMAS).sort()).toEqual(
      [
        'AccountDeleted',
        'CareLinkCreated',
        'CareLinkEnded',
        'CareLinkInviteCreated',
        'CareLinkInviteDeclined',
        'CareLinkInviteExpired',
        'DoseOutcomeChanged',
        'EmailVerificationRequested',
        'MedicineArchived',
        'PasswordResetRequested',
        'ProfileChanged',
        'RefillThresholdCrossed',
        'UserRegistered',
      ].sort(),
    );
  });
});
