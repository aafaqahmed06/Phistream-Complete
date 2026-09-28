import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { errorResponses } from '../../shared/errors/error-envelope.js';
import { parseBearerToken } from '../../shared/security/access-tokens.js';
import {
  APPLICATION_BODY_LIMIT_BYTES,
  applicationCreatedResponseSchema,
  applicationFormResponseSchema,
  applicationIdParamsSchema,
  applicationRequestSchema,
  applicationStatusResponseSchema,
  type ApplicationCreatedResponse,
  type ApplicationStatusResponse,
} from './applications.schemas.js';
import type { ApplicationsService } from './applications.service.js';

export interface ApplicationRoutesOptions {
  readonly service: ApplicationsService;
  /** Per-IP limit for submissions (stricter than the global default). */
  readonly rateLimit: { readonly max: number; readonly windowMs: number };
  /** Browser/CDN cache lifetime for the form definition. 0 disables caching. */
  readonly formCacheMaxAgeSeconds: number;
}

export const STATUS_TOKEN_SECURITY_SCHEME = 'applicationStatusToken';

/** Public eligibility application endpoints. Handlers only parse and delegate. */
export const applicationRoutes: FastifyPluginAsyncZod<ApplicationRoutesOptions> = async (
  app,
  options,
) => {
  const { service, rateLimit, formCacheMaxAgeSeconds } = options;
  const tags = ['applications'];

  app.get(
    '/applications/form',
    {
      schema: {
        tags,
        operationId: 'getApplicationForm',
        summary: 'The current eligibility form',
        description:
          'The ACTIVE form version and its questions, for rendering. `404 NOT_FOUND` when no form is published.',
        response: { 200: applicationFormResponseSchema, ...errorResponses },
      },
    },
    async (_request, reply) => {
      const form = await service.getActiveForm();
      reply.header(
        'cache-control',
        formCacheMaxAgeSeconds > 0 ? `public, max-age=${formCacheMaxAgeSeconds}` : 'no-cache',
      );
      return {
        data: {
          version: form.version,
          title: form.definition.title ?? null,
          description: form.definition.description ?? null,
          questions: form.definition.questions,
        },
      };
    },
  );

  app.post(
    '/applications',
    {
      bodyLimit: APPLICATION_BODY_LIMIT_BYTES,
      config: { rateLimit: { max: rateLimit.max, timeWindow: rateLimit.windowMs } },
      schema: {
        tags,
        operationId: 'submitApplication',
        summary: 'Submit an eligibility application',
        description: [
          'Validates the answers against the current form version, links the application to a lead, records a SUBMITTED lifecycle event, and queues an internal notification.',
          '',
          '- `201`: returns the application id and reference, plus a status token shown only once.',
          '- `400 VALIDATION_ERROR`: invalid fields; answer problems use paths like `/answers/<key>`. Unknown and inactive service tiers get the same error.',
          '- `400 VERIFICATION_FAILED`: human verification failed (only when a provider is configured).',
          '- `409 FORM_VERSION_OUTDATED`: `formVersion` is not the published version. Reload the form.',
          '- `409 DUPLICATE_SUBMISSION`: the same application (email, form, tier, answers) was received within the last hour.',
          '- `429 RATE_LIMITED`: per-IP limit, or too many applications for one email in 24 hours.',
          '- `503 SERVICE_UNAVAILABLE`: no form is published (applications closed).',
        ].join('\n'),
        body: applicationRequestSchema,
        response: { 201: applicationCreatedResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const { honeypot, verificationToken, ...submission } = request.body;
      const created = await service.submit(submission, {
        remoteIp: request.ip,
        honeypot,
        verificationToken,
      });
      const body: ApplicationCreatedResponse = {
        data: {
          application: { id: created.id, reference: created.reference },
          nextStep: 'UNDER_REVIEW',
          statusAccess: {
            token: created.statusAccess.token,
            expiresAt: created.statusAccess.expiresAt.toISOString(),
          },
        },
      };
      return reply.status(201).header('cache-control', 'no-store').send(body);
    },
  );

  app.get(
    '/applications/:id/status',
    {
      // RFC 9110: a 401 must say which scheme to use.
      onSend: async (_request, reply) => {
        if (reply.statusCode === 401) reply.header('www-authenticate', 'Bearer');
      },
      schema: {
        tags,
        operationId: 'getApplicationStatus',
        summary: 'Public status of your own application',
        description: [
          'Requires `Authorization: Bearer <statusAccess.token>` from the submission response. Tokens expire (see `expiresAt`) and are never accepted in the URL.',
          '',
          '- `401 UNAUTHORIZED`: header missing or malformed.',
          '- `404 NOT_FOUND`: unknown application, wrong/expired/revoked token, or a token for another application. These cases are indistinguishable by design.',
          '',
          'Only a coarse public status is returned; answers, notes, and internal states are never exposed.',
        ].join('\n'),
        security: [{ [STATUS_TOKEN_SECURITY_SCHEME]: [] }],
        params: applicationIdParamsSchema,
        response: { 200: applicationStatusResponseSchema, ...errorResponses },
      },
    },
    async (request, reply) => {
      const view = await service.getStatus(
        request.params.id,
        parseBearerToken(request.headers.authorization),
      );
      const body: ApplicationStatusResponse = {
        data: {
          reference: view.reference,
          status: view.status,
          submittedAt: view.submittedAt.toISOString(),
        },
      };
      return reply.header('cache-control', 'no-store').send(body);
    },
  );
};
