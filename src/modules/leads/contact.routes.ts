import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { errorResponses } from '../../shared/errors/error-envelope.js';
import {
  CONTACT_BODY_LIMIT_BYTES,
  contactAcceptedResponseSchema,
  contactRequestSchema,
  type ContactAcceptedResponse,
} from './contact.schemas.js';
import type { ContactService } from './contact.service.js';

export interface ContactRoutesOptions {
  readonly service: ContactService;
  /** Per-IP limit for this route (stricter than the global default). */
  readonly rateLimit: { readonly max: number; readonly windowMs: number };
}

const ACCEPTED: ContactAcceptedResponse = { data: { status: 'RECEIVED' } };

/** Public contact form. The handler only parses and delegates. */
export const contactRoutes: FastifyPluginAsyncZod<ContactRoutesOptions> = async (app, options) => {
  const { service, rateLimit } = options;

  app.post(
    '/contact',
    {
      bodyLimit: CONTACT_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: rateLimit.max, timeWindow: rateLimit.windowMs } },
      schema: {
        tags: ['contact'],
        operationId: 'submitContact',
        summary: 'Submit the contact form',
        description: [
          'Records a contact message and creates or updates the matching lead.',
          '',
          '- Always answers `202` with the same body once the input is valid, whether the email is new, already known, a duplicate, throttled, or screened out as spam. It never reveals whether an email exists.',
          `- Rate-limited per client IP (stricter than other routes). Over the limit: \`429 RATE_LIMITED\` with \`Retry-After\`.`,
          '- `400 VERIFICATION_FAILED` only when a human-verification provider is configured and `verificationToken` is missing or invalid; the user can retry.',
          '- Unknown fields are rejected (`400 VALIDATION_ERROR`). Blank optional fields are treated as absent.',
        ].join('\n'),
        body: contactRequestSchema,
        response: { 202: contactAcceptedResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { honeypot, verificationToken, ...submission } = request.body;
      await service.submit(submission, { remoteIp: request.ip, honeypot, verificationToken });
      return reply.status(202).header('cache-control', 'no-store').send(ACCEPTED);
    },
  );
};
