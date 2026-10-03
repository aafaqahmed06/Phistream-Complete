import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

import { REQUEST_ID_HEADER } from '../../shared/http/request-id.js';

export interface CorsPluginOptions {
  /** Exact origins allowed to call the API from a browser. Empty = none. */
  readonly allowedOrigins: readonly string[];
}

/**
 * Strict allow-list CORS. Requests from other origins still reach the server
 * (CORS is a browser control), but receive no CORS headers, so browsers block
 * the response. Credentials are disabled: admin auth will use bearer tokens.
 */
async function corsPlugin(app: FastifyInstance, options: CorsPluginOptions): Promise<void> {
  const allowed = new Set(options.allowedOrigins);

  await app.register(cors, {
    origin: (origin, callback) => {
      callback(null, origin !== undefined && allowed.has(origin));
    },
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', REQUEST_ID_HEADER],
    exposedHeaders: [
      REQUEST_ID_HEADER,
      'Retry-After',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    credentials: false,
    maxAge: 600,
  });
}

export default fp(corsPlugin, { name: 'cors' });
