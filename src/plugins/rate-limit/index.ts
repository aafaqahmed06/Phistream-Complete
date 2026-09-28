import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export interface RateLimitPluginOptions {
  readonly max: number;
  readonly windowMs: number;
}

/**
 * Global, IP-keyed rate limit applied to every route by default.
 *
 * - Routes can tighten/loosen limits via `config: { rateLimit: { max, timeWindow } }`
 *   (public form endpoints should use stricter limits) or opt out with
 *   `config: { rateLimit: false }` (health checks).
 * - The client IP honours TRUST_PROXY, so configure it correctly behind a proxy.
 * - The store is in-memory and therefore per-instance. Switch to a shared store
 *   (e.g. Redis) before running more than one instance.
 */
async function rateLimitPlugin(
  app: FastifyInstance,
  options: RateLimitPluginOptions,
): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: options.max,
    timeWindow: options.windowMs,
  });
}

export default fp(rateLimitPlugin, { name: 'rate-limit' });
