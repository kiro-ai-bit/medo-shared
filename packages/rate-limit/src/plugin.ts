import fastifyPlugin from 'fastify-plugin';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SlidingWindowLimiter } from './limiter.js';
import {
  DEFAULT_LIMITS,
  DEFAULT_WINDOW_MS,
  defaultGetUserId,
  detectScope,
  type RateLimitOptions,
  type RateLimitOverride,
  type RateLimitRouteConfig,
  type RateLimitScope,
} from './types.js';

interface ResolvedPolicy {
  scope: RateLimitScope;
  max: number;
  windowMs: number;
  subject: string;
}

function isOverride(config: unknown): config is RateLimitOverride {
  return typeof config === 'object' && config !== null;
}

function resolvePolicy(
  request: FastifyRequest,
  routeConfig: Exclude<RateLimitRouteConfig, false | 'internal'> | undefined,
  options: Required<Pick<RateLimitOptions, 'limits' | 'windowMs' | 'getUserId'>>,
): ResolvedPolicy {
  const userId = options.getUserId(request);
  const autoScope: RateLimitScope = userId ? detectScope(request.method) : 'public';

  let scope = autoScope;
  let max: number | undefined;
  let windowMs: number | undefined;

  if (typeof routeConfig === 'string') {
    scope = routeConfig;
  } else if (isOverride(routeConfig)) {
    if (routeConfig.scope) scope = routeConfig.scope;
    max = routeConfig.max;
    windowMs = routeConfig.windowMs;
  }

  const resolvedScope = scope;
  const resolvedMax = max ?? options.limits[resolvedScope] ?? DEFAULT_LIMITS[resolvedScope];
  const resolvedWindowMs = windowMs ?? options.windowMs;

  const subject =
    resolvedScope === 'public' ? `ip:${request.ip}` : `user:${userId ?? `ip:${request.ip}`}`;

  return {
    scope: resolvedScope,
    max: resolvedMax,
    windowMs: resolvedWindowMs,
    subject,
  };
}

function sendRateLimited(
  request: FastifyRequest,
  reply: FastifyReply,
  retryAfterMs: number,
): FastifyReply {
  const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return reply
    .code(429)
    .header('Retry-After', String(retryAfterSec))
    .send({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests',
        requestId: String(request.id),
      },
    });
}

/**
 * Shared Fastify rate-limit plugin (Map 3 ticket 09).
 *
 * Non-durable: counters are in-memory sliding windows and reset on
 * process restart.
 *
 * Ordering contract: register auth/identity decoration BEFORE this plugin
 * — the check runs in `preHandler`, so `request.userId` (or the configured
 * `getUserId`) must already be populated for authenticated scopes.
 *
 * Route opt-out: `config: { rateLimit: 'internal' }` (or `false`) bypasses
 * limiting — use for internal service-JWT routes.
 */
export const rateLimitPlugin = fastifyPlugin(
  async (app: FastifyInstance, options: RateLimitOptions = {}) => {
    const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    const limits = { ...DEFAULT_LIMITS, ...options.limits };
    const getUserId = options.getUserId ?? defaultGetUserId;
    const now = options.now;
    const limiter = new SlidingWindowLimiter(now);

    const sweepMs = options.sweepIntervalMs ?? windowMs;
    const sweeper = setInterval(() => limiter.sweep(), sweepMs);
    sweeper.unref?.();
    app.addHook('onClose', async () => {
      clearInterval(sweeper);
    });

    app.addHook('preHandler', async (request, reply) => {
      const routeConfig = request.routeOptions.config.rateLimit;
      if (routeConfig === false || routeConfig === 'internal') {
        return;
      }
      const policy = resolvePolicy(request, routeConfig, {
        limits,
        windowMs,
        getUserId,
      });
      const key = `${policy.scope}:${policy.windowMs}:${policy.max}:${policy.subject}`;
      const result = limiter.check(key, policy.max, policy.windowMs);
      if (!result.allowed) {
        return sendRateLimited(request, reply, result.retryAfterMs);
      }
    });
  },
  { name: '@kiro-ai-bit/rate-limit' },
);
