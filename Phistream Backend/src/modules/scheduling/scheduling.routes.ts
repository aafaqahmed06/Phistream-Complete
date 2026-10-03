import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { errorResponses } from '../../shared/errors/error-envelope.js';
import { parseBearerToken } from '../../shared/security/access-tokens.js';
import {
  schedulingSessionResponseSchema,
  webhookParamsSchema,
  webhookResponseSchema,
} from './scheduling.schemas.js';
import type { SchedulingService } from './scheduling.service.js';

export const SCHEDULING_TOKEN_SECURITY_SCHEME = 'schedulingToken';

/** Generous: providers may burst deliveries; the signature is the real gate. */
const WEBHOOK_RATE_LIMIT = { max: 600, timeWindow: 60_000 };
const WEBHOOK_BODY_LIMIT_BYTES = 256 * 1024;

export interface SchedulingRoutesOptions {
  readonly service: SchedulingService;
}

/** Public: the applicant exchanges their scheduling token for the booking page. */
export const schedulingRoutes: FastifyPluginAsyncZod<SchedulingRoutesOptions> = async (
  app,
  { service },
) => {
  app.get(
    '/scheduling/session',
    {
      onSend: async (_request, reply) => {
        reply.header('cache-control', 'no-store');
        if (reply.statusCode === 401) reply.header('www-authenticate', 'Bearer');
      },
      schema: {
        tags: ['scheduling'],
        operationId: 'getSchedulingSession',
        summary: 'Exchange a scheduling token for the booking page',
        description: [
          'Requires `Authorization: Bearer <scheduling token>`. The token reaches the applicant in the URL **fragment** of the scheduling page (`#token=…`), which browsers never send to servers. Read it client-side and send it in this header. Never put it in a path or query string.',
          '',
          '- `200`: `schedulingUrl` is the provider booking page (prefilled). Booking through it links the meeting to the application.',
          '- `401`: header missing or malformed.',
          '- `404`: unknown, expired, already-used, or no-longer-eligible token. All of these look the same.',
          '- `503`: scheduling is not configured.',
        ].join('\n'),
        security: [{ [SCHEDULING_TOKEN_SECURITY_SCHEME]: [] }],
        response: { 200: schedulingSessionResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const access = await service.resolveAccess(parseBearerToken(request.headers.authorization));
      return { data: { eligible: true as const, ...access } };
    },
  );
};

/**
 * Provider webhooks. Registered in its own scope because the JSON parser is
 * replaced: the adapter must see the exact raw bytes to verify the signature
 * before anything is parsed.
 */
export const schedulingWebhookRoutes: FastifyPluginAsyncZod<SchedulingRoutesOptions> = async (
  app,
  { service },
) => {
  app.removeAllContentTypeParsers();
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body);
  });

  app.post(
    '/webhooks/scheduling/:provider',
    {
      bodyLimit: WEBHOOK_BODY_LIMIT_BYTES,
      config: { rateLimit: WEBHOOK_RATE_LIMIT },
      schema: {
        tags: ['scheduling'],
        operationId: 'receiveSchedulingWebhook',
        summary: 'Scheduling provider webhook (called by the provider, not the frontend)',
        description: [
          'Verified by the provider signature over the raw body. Configure this URL and its secret in the provider (docs/scheduling.md).',
          '',
          '- `200 { received: true }`: accepted. This includes duplicates (deduplicated by event id), ignored event types, and bookings that could not be linked (staff are notified).',
          '- `401`: missing or invalid signature. `400`: signed but unrecognized payload.',
          '- `404`: unknown provider. `5xx`: processing failed; nothing was recorded, so the provider retry will be processed.',
        ].join('\n'),
        params: webhookParamsSchema,
        response: { 200: webhookResponseSchema, ...errorResponses },
      },
    },
    async (request) => {
      const rawBody = Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0);
      await service.handleWebhook(request.params.provider, {
        headers: request.headers,
        rawBody,
      });
      return { received: true as const };
    },
  );
};
