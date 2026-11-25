import { describe, expect, it, vi } from 'vitest';
import { createDeferred, defineTestConfig, flushPromises, useFakeClock } from '../src/index.js';

describe('createDeferred', () => {
  it('resolves with the provided value', async () => {
    const d = createDeferred<string>();
    d.resolve('ok');
    await expect(d.promise).resolves.toBe('ok');
  });

  it('rejects with the provided reason', async () => {
    const d = createDeferred<number>();
    const err = new Error('boom');
    d.reject(err);
    await expect(d.promise).rejects.toBe(err);
  });
});

describe('flushPromises', () => {
  it('waits until queued microtasks have run', async () => {
    const order: string[] = [];
    Promise.resolve().then(() => order.push('micro'));
    void flushPromises().then(() => order.push('flush'));
    expect(order).toEqual([]);
    await flushPromises();
    await flushPromises();
    expect(order).toContain('micro');
    expect(order.indexOf('micro')).toBeLessThan(order.indexOf('flush'));
  });
});

describe('useFakeClock', () => {
  it('freezes Date and advances deterministically', () => {
    const clock = useFakeClock(new Date('2026-01-01T00:00:00Z'));
    expect(new Date().toISOString()).toBe('2026-01-01T00:00:00.000Z');
    clock.advance(60_000);
    expect(new Date().toISOString()).toBe('2026-01-01T00:01:00.000Z');
    clock.restore();
  });

  it('restore returns real timers', () => {
    const clock = useFakeClock();
    clock.restore();
    vi.useRealTimers();
    expect(vi.isFakeTimers()).toBe(false);
  });
});

describe('defineTestConfig', () => {
  it('defaults environment to node', () => {
    const config = defineTestConfig();
    expect(config.test?.environment).toBe('node');
  });

  it('merges caller overrides without dropping defaults', () => {
    const config = defineTestConfig({
      test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
    });
    expect(config.test?.environment).toBe('jsdom');
    expect(config.test?.include).toEqual(['tests/**/*.test.ts']);
  });
});
