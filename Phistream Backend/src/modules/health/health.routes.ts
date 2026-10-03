import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { AppError } from '../../shared/errors/app-error.js';
import { errorResponses } from '../../shared/errors/error-envelope.js';
import {
  healthResponseSchema,
  readinessResponseSchema,
  type HealthResponse,
  type ReadinessResponse,
} from './health.schemas.js';

export interface HealthRoutesOptions {
  /** Readiness dependency check. Absent = not ready (e.g. tests without a DB). */
  readonly database?: { ping(): Promise<void> } | undefined;
  readonly readinessTimeoutMs?: number;
  /**
   * Include in OpenAPI. The root-level copies (/health, /health/ready) are for
   * load balancers and are hidden, so each operation is documented once.
   */
  readonly documented?: boolean;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * - `/health` (liveness): the process is up and serving HTTP. Checks no
 *   dependencies, so a database outage does not get the container restarted.
 * - `/health/ready` (readiness): the database is reachable. Use it to decide
 *   whether to route traffic to this instance.
 */
export const healthRoutes: FastifyPluginAsyncZod<HealthRoutesOptions> = async (app, options) => {
  const readinessTimeoutMs = options.readinessTimeoutMs ?? 3000;
  const hide = options.documented === false;

  app.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: {
        hide,
        tags: ['health'],
        operationId: 'getHealth',
        summary: 'Liveness check',
        response: { 200: healthResponseSchema, ...errorResponses },
      },
    },
    (): HealthResponse => ({ status: 'ok', timestamp: new Date().toISOString() }),
  );

  app.get(
    '/health/ready',
    {
      config: { rateLimit: false },
      schema: {
        hide,
        tags: ['health'],
        operationId: 'getReadiness',
        summary: 'Readiness check (database connectivity)',
        response: { 200: readinessResponseSchema, ...errorResponses },
      },
    },
    async (request): Promise<ReadinessResponse> => {
      try {
        if (!options.database) throw new Error('database not configured');
        await withTimeout(options.database.ping(), readinessTimeoutMs);
      } catch (error) {
        request.log.warn({ err: error }, 'readiness check failed');
        throw new AppError(503, 'SERVICE_UNAVAILABLE', 'The service is not ready.');
      }
      return { status: 'ok', checks: { database: 'ok' }, timestamp: new Date().toISOString() };
    },
  );
};
