import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

export interface SecurityHeadersOptions {
  /** Send Strict-Transport-Security (only when served over HTTPS, i.e. production). */
  readonly hsts: boolean;
}

/**
 * Security headers for a JSON API (every response, errors included).
 *
 * - nosniff / no-referrer / DENY framing: the API is never rendered or framed.
 * - CSP `default-src 'none'`: responses are data, never documents. The
 *   Swagger UI under /docs needs scripts and styles, so it is exempt.
 * - CORP same-origin: blocks cross-origin *no-cors* embedding of responses;
 *   CORS fetches from allowed origins are unaffected.
 * - HSTS in production (TLS terminates at the host / load balancer).
 */
async function securityHeadersPlugin(
  app: FastifyInstance,
  options: SecurityHeadersOptions,
): Promise<void> {
  app.addHook('onSend', async (request, reply) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    reply.header('cross-origin-resource-policy', 'same-origin');
    if (!request.url.startsWith('/docs')) {
      reply.header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    }
    if (options.hsts) {
      reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
    }
  });
}

export default fp(securityHeadersPlugin, { name: 'security-headers' });
