import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { errorResponses } from '../../shared/errors/error-envelope.js';
import {
  ANALYTICS_BODY_LIMIT_BYTES,
  analyticsEventAcceptedSchema,
  analyticsEventRequestSchema,
  CLIENT_ANALYTICS_EVENTS,
} from './analytics.schemas.js';
import type { AnalyticsService } from './analytics.service.js';

export interface AnalyticsRoutesOptions {
  readonly service: AnalyticsService;
  readonly rateLimit: { readonly max: number; readonly windowMs: number };
}

/**
 * Public funnel event ingestion. Own scope: `text/plain` bodies are parsed as
 * JSON here (only here), so `navigator.sendBeacon(url, JSON.stringify(e))`
 * works without a CORS preflight.
 */
export const analyticsRoutes: FastifyPluginAsyncZod<AnalyticsRoutesOptions> = async (
  app,
  { service, rateLimit },
) => {
  app.removeContentTypeParser('text/plain');
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_request, body, done) => {
    try {
      done(null, JSON.parse(body as string));
    } catch {
      // Generic client error; the parse message (which quotes input) is not exposed.
      done(Object.assign(new Error('invalid JSON body'), { statusCode: 400 }), undefined);
    }
  });

  app.post(
    '/analytics/events',
    {
      bodyLimit: ANALYTICS_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: rateLimit.max, timeWindow: rateLimit.windowMs } },
      schema: {
        tags: ['analytics'],
        operationId: 'recordAnalyticsEvent',
        summary: 'Record an anonymous funnel event',
        description: [
          `Allowed events: ${CLIENT_ANALYTICS_EVENTS.map((e) => `\`${e}\``).join(', ')}. Anything else (e.g. \`application_accepted\`) is rejected with \`400\`: business outcomes are measured by the backend, never reported by the browser.`,
          '',
          '- Body: JSON (`application/json`, or `text/plain` for `navigator.sendBeacon`).',
          '- Stored: event, anonymous session id, source/campaign, page path (query and fragment dropped), referrer origin. Not stored: IP address, user agent, cookies, anything else.',
          '- `202` on success. Rate-limited per IP (`429`).',
        ].join('\n'),
        body: analyticsEventRequestSchema,
        response: { 202: analyticsEventAcceptedSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      await service.record(request.body);
      return reply
        .status(202)
        .header('cache-control', 'no-store')
        .send({ data: { status: 'RECORDED' } });
    },
  );
};
