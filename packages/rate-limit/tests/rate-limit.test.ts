import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { rateLimitPlugin, type RateLimitOptions } from '../src/index.js';

let app: FastifyInstance | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

async function buildApp(
  options: RateLimitOptions = {},
  routes?: (app: FastifyInstance) => void,
): Promise<FastifyInstance> {
  const instance = Fastify();
  // mirrors service bootstrap: identity decoration (auth hook) is registered
  // before the rate-limit plugin, so userId is visible at preHandler time
  instance.addHook('onRequest', async (request) => {
    const u = request.headers['x-user'];
    if (typeof u === 'string') {
      (request as { userId?: string }).userId = u;
    }
  });
  await instance.register(rateLimitPlugin, options);
  (routes ?? defaultRoutes)(instance);
  await instance.ready();
  app = instance;
  return instance;
}

function defaultRoutes(instance: FastifyInstance): void {
  instance.get('/public', async () => ({ ok: true }));
  instance.post('/write', async () => ({ ok: true }));
  instance.get('/read', async () => ({ ok: true }));
  instance.get('/internal', { config: { rateLimit: 'internal' } }, async () => ({ ok: true }));
  instance.get('/limited', { config: { rateLimit: { max: 2 } } }, async () => ({ ok: true }));
  instance.get('/write-scope', { config: { rateLimit: 'write' } }, async () => ({ ok: true }));
}

async function hit(
  instance: FastifyInstance,
  method: 'GET' | 'POST',
  url: string,
  headers: Record<string, string> = {},
  remoteAddress = '127.0.0.1',
) {
  return instance.inject({ method, url, headers, remoteAddress });
}

describe('public scope (by IP, 30/min)', () => {
  it('allows 30 requests then returns 429 with Retry-After', async () => {
    const instance = await buildApp();
    for (let i = 0; i < 30; i += 1) {
      const res = await hit(instance, 'GET', '/public');
      expect(res.statusCode).toBe(200);
    }
    const res = await hit(instance, 'GET', '/public');
    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(60);
  });

  it('tracks separate buckets per IP', async () => {
    const instance = await buildApp();
    for (let i = 0; i < 30; i += 1) {
      await hit(instance, 'GET', '/public', {}, '10.0.0.1');
    }
    const blocked = await hit(instance, 'GET', '/public', {}, '10.0.0.1');
    expect(blocked.statusCode).toBe(429);
    const other = await hit(instance, 'GET', '/public', {}, '10.0.0.2');
    expect(other.statusCode).toBe(200);
  });

  it('unauthenticated POST falls back to public scope', async () => {
    const instance = await buildApp();
    for (let i = 0; i < 30; i += 1) {
      await hit(instance, 'POST', '/write');
    }
    const res = await hit(instance, 'POST', '/write');
    expect(res.statusCode).toBe(429);
  });
});

describe('authenticated scopes (by userId)', () => {
  it('write scope allows 60/min per userId', async () => {
    const instance = await buildApp();
    const headers = { 'x-user': 'user-a' };
    for (let i = 0; i < 60; i += 1) {
      const res = await hit(instance, 'POST', '/write', headers);
      expect(res.statusCode).toBe(200);
    }
    const res = await hit(instance, 'POST', '/write', headers);
    expect(res.statusCode).toBe(429);
  });

  it('read scope allows 300/min per userId', async () => {
    const instance = await buildApp();
    const headers = { 'x-user': 'user-a' };
    for (let i = 0; i < 300; i += 1) {
      const res = await hit(instance, 'GET', '/read', headers);
      expect(res.statusCode).toBe(200);
    }
    const res = await hit(instance, 'GET', '/read', headers);
    expect(res.statusCode).toBe(429);
  });

  it('keys by userId, not IP: other users unaffected, same user blocked from any IP', async () => {
    const instance = await buildApp();
    const a = { 'x-user': 'user-a' };
    for (let i = 0; i < 60; i += 1) {
      await hit(instance, 'POST', '/write', a, '10.0.0.1');
    }
    expect((await hit(instance, 'POST', '/write', a)).statusCode).toBe(429);
    expect((await hit(instance, 'POST', '/write', a, '10.9.9.9')).statusCode).toBe(429);
    const b = await hit(instance, 'POST', '/write', { 'x-user': 'user-b' });
    expect(b.statusCode).toBe(200);
  });

  it('write and read scopes have independent buckets', async () => {
    const instance = await buildApp();
    const headers = { 'x-user': 'user-a' };
    for (let i = 0; i < 60; i += 1) {
      await hit(instance, 'POST', '/write', headers);
    }
    expect((await hit(instance, 'POST', '/write', headers)).statusCode).toBe(429);
    expect((await hit(instance, 'GET', '/read', headers)).statusCode).toBe(200);
  });
});

describe('window expiry', () => {
  it('resets the counter after windowMs elapses', async () => {
    let now = 1_000_000;
    const instance = await buildApp({ now: () => now });
    for (let i = 0; i < 30; i += 1) {
      await hit(instance, 'GET', '/public');
    }
    expect((await hit(instance, 'GET', '/public')).statusCode).toBe(429);
    now += 60_001;
    expect((await hit(instance, 'GET', '/public')).statusCode).toBe(200);
  });
});

describe('internal routes', () => {
  it('rateLimit:"internal" bypasses limiting entirely', async () => {
    const instance = await buildApp();
    for (let i = 0; i < 100; i += 1) {
      const res = await hit(instance, 'GET', '/internal');
      expect(res.statusCode).toBe(200);
    }
  });
});

describe('per-route overrides', () => {
  it('object override {max} applies its own bucket', async () => {
    const instance = await buildApp();
    for (let i = 0; i < 2; i += 1) {
      expect((await hit(instance, 'GET', '/limited')).statusCode).toBe(200);
    }
    const res = await hit(instance, 'GET', '/limited');
    expect(res.statusCode).toBe(429);
    // override bucket is independent from default public bucket
    expect((await hit(instance, 'GET', '/public')).statusCode).toBe(200);
  });

  it('string scope override forces write scope on a GET route', async () => {
    const instance = await buildApp();
    const headers = { 'x-user': 'user-a' };
    // write scope = 60/min even though method is GET
    for (let i = 0; i < 60; i += 1) {
      expect((await hit(instance, 'GET', '/write-scope', headers)).statusCode).toBe(200);
    }
    expect((await hit(instance, 'GET', '/write-scope', headers)).statusCode).toBe(429);
    // read bucket on same user unaffected
    expect((await hit(instance, 'GET', '/read', headers)).statusCode).toBe(200);
  });
});

describe('429 response shape', () => {
  it('returns JSON error envelope with code RATE_LIMITED', async () => {
    const instance = await buildApp();
    for (let i = 0; i < 30; i += 1) {
      await hit(instance, 'GET', '/public');
    }
    const res = await hit(instance, 'GET', '/public');
    expect(res.statusCode).toBe(429);
    const body = res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(typeof body.error.message).toBe('string');
  });
});
