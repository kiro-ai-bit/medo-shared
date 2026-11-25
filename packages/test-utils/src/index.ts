import { setImmediate } from 'node:timers/promises';
import { vi } from 'vitest';
import type { ViteUserConfig } from 'vitest/config';

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function flushPromises(): Promise<void> {
  return setImmediate();
}

export interface FakeClock {
  advance: (ms: number) => void;
  setSystemTime: (time: Date | number | string) => void;
  now: () => Date;
  restore: () => void;
}

export function useFakeClock(start?: Date | number | string): FakeClock {
  vi.useFakeTimers();
  if (start !== undefined) {
    vi.setSystemTime(start);
  }
  return {
    advance: (ms) => {
      vi.advanceTimersByTime(ms);
    },
    setSystemTime: (time) => {
      vi.setSystemTime(time);
    },
    now: () => new Date(),
    restore: () => {
      vi.useRealTimers();
    },
  };
}

export function defineTestConfig(overrides: ViteUserConfig = {}): ViteUserConfig {
  const { test, ...rest } = overrides;
  return {
    ...rest,
    test: {
      environment: 'node',
      ...test,
    },
  };
}
