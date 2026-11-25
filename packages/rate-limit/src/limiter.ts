interface Bucket {
  windowMs: number;
  times: number[];
}

export type CheckResult = { allowed: true } | { allowed: false; retryAfterMs: number };

/**
 * In-memory sliding-window counter store. Non-durable by design: all
 * counters live in process memory and reset on restart — acceptable per
 * Map 3 ticket 09 (single-container services, fail-open on restart).
 */
export class SlidingWindowLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly now: () => number = Date.now) {}

  check(key: string, max: number, windowMs: number): CheckResult {
    const now = this.now();
    const cutoff = now - windowMs;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { windowMs, times: [] };
      this.buckets.set(key, bucket);
    }
    bucket.times = bucket.times.filter((t) => t > cutoff);
    if (bucket.times.length === 0) {
      this.buckets.delete(key);
      bucket = { windowMs, times: [] };
      this.buckets.set(key, bucket);
    }
    if (bucket.times.length >= max) {
      const oldest = bucket.times[0]!;
      return { allowed: false, retryAfterMs: oldest + windowMs - now };
    }
    bucket.times.push(now);
    return { allowed: true };
  }

  sweep(): void {
    const now = this.now();
    for (const [key, bucket] of this.buckets) {
      const cutoff = now - bucket.windowMs;
      bucket.times = bucket.times.filter((t) => t > cutoff);
      if (bucket.times.length === 0) {
        this.buckets.delete(key);
      }
    }
  }

  get size(): number {
    return this.buckets.size;
  }
}
