import type { FastifyRequest } from 'fastify';

export type RateLimitScope = 'public' | 'write' | 'read';

export type RateLimitBypass = false | 'internal';

export interface RateLimitOverride {
  scope?: RateLimitScope;
  max?: number;
  windowMs?: number;
}

export type RateLimitRouteConfig = RateLimitBypass | RateLimitScope | RateLimitOverride;

declare module 'fastify' {
  interface FastifyContextConfig {
    rateLimit?: RateLimitRouteConfig;
  }
}

export interface RateLimitOptions {
  windowMs?: number;
  limits?: Partial<Record<RateLimitScope, number>>;
  now?: () => number;
  getUserId?: (request: FastifyRequest) => string | undefined;
  sweepIntervalMs?: number;
}

export const DEFAULT_WINDOW_MS = 60_000;

export const DEFAULT_LIMITS: Record<RateLimitScope, number> = {
  public: 30,
  write: 60,
  read: 300,
};

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function detectScope(method: string): RateLimitScope {
  return READ_METHODS.has(method.toUpperCase()) ? 'read' : 'write';
}

export function defaultGetUserId(request: FastifyRequest): string | undefined {
  const carrier = request as {
    userId?: unknown;
    user?: { sub?: unknown };
  };
  if (typeof carrier.userId === 'string' && carrier.userId.length > 0) {
    return carrier.userId;
  }
  if (carrier.user && typeof carrier.user.sub === 'string' && carrier.user.sub.length > 0) {
    return carrier.user.sub;
  }
  return undefined;
}
