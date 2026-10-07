import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { AppError } from '../../shared/errors/app-error.js';
import { safeEqual } from '../../shared/security/access-tokens.js';
import type { DispatchTrigger } from './dispatch-trigger.js';

export interface DispatchRoutesOptions {
  readonly trigger: DispatchTrigger;
  /** Undefined = the endpoint answers 404, as if it did not exist. */
  readonly cronSecret: string | undefined;
}

/**
 * GET /internal/notifications/dispatch -- the scheduled sweep (Vercel Cron,
 * vercel.json). Retries failed sends and anything the after-response trigger
 * missed. Requires `Authorization: Bearer <CRON_SECRET>`, which Vercel Cron
 * sends by itself. Not part of the public API, so hidden from OpenAPI.
 */
export const dispatchRoutes: FastifyPluginAsyncZod<DispatchRoutesOptions> = async (
  app,
  { trigger, cronSecret },
) => {
  app.get(
    '/internal/notifications/dispatch',
    { schema: { hide: true } },
    async (request, reply) => {
      const header = request.headers.authorization ?? '';
      if (!cronSecret || !safeEqual(header, `Bearer ${cronSecret}`)) {
        throw new AppError(404, 'NOT_FOUND', 'Route not found.');
      }
      const summary = await trigger.runNow();
      request.log.info({ summary }, 'scheduled notification dispatch');
      return reply.header('cache-control', 'no-store').send({ data: summary });
    },
  );
};
