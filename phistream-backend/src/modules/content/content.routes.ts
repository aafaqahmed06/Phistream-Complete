import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';

import { errorResponses } from '../../shared/errors/error-envelope.js';
import {
  faqListResponseSchema,
  homeResponseSchema,
  onboardingResponseSchema,
  paginationQuerySchema,
  serviceListResponseSchema,
  serviceResponseSchema,
  serviceSlugParamsSchema,
  testimonialListResponseSchema,
} from './content.schemas.js';
import type { ContentService } from './content.service.js';

export interface ContentRoutesOptions {
  readonly service: ContentService;
  /** Browser/CDN cache lifetime for successful responses. 0 disables caching. */
  readonly cacheMaxAgeSeconds: number;
}

/**
 * Public, unauthenticated, read-only content endpoints. Handlers only parse
 * input and delegate; visibility rules live in the service/repository.
 */
export const contentRoutes: FastifyPluginAsyncZod<ContentRoutesOptions> = async (app, options) => {
  const { service, cacheMaxAgeSeconds } = options;

  const cacheControl =
    cacheMaxAgeSeconds > 0
      ? `public, max-age=${cacheMaxAgeSeconds}, stale-while-revalidate=${cacheMaxAgeSeconds * 5}`
      : 'no-cache';

  // Only successful responses are cacheable; errors (404, 429, ...) are not.
  app.addHook('onSend', async (_request, reply) => {
    if (reply.statusCode === 200) reply.header('cache-control', cacheControl);
  });

  const tags = ['content'];

  app.get(
    '/home',
    {
      schema: {
        tags,
        operationId: 'getHomeContent',
        summary: 'Homepage content',
        description:
          'Public contact details, social links, and the first page of active services, FAQs, and testimonials.',
        response: { 200: homeResponseSchema, ...errorResponses },
      },
    },
    async () => ({ data: await service.getHome() }),
  );

  app.get(
    '/services',
    {
      schema: {
        tags,
        operationId: 'listServices',
        summary: 'Active service tiers, ordered for display',
        querystring: paginationQuerySchema,
        response: { 200: serviceListResponseSchema, ...errorResponses },
      },
    },
    async (request) => service.listServices(request.query),
  );

  app.get(
    '/services/:slug',
    {
      schema: {
        tags,
        operationId: 'getService',
        summary: 'One active service tier by slug',
        params: serviceSlugParamsSchema,
        response: { 200: serviceResponseSchema, ...errorResponses },
      },
    },
    async (request) => ({ data: await service.getService(request.params.slug) }),
  );

  app.get(
    '/faqs',
    {
      schema: {
        tags,
        operationId: 'listFaqs',
        summary: 'Active FAQs, ordered for display',
        querystring: paginationQuerySchema,
        response: { 200: faqListResponseSchema, ...errorResponses },
      },
    },
    async (request) => service.listFaqs(request.query),
  );

  app.get(
    '/testimonials',
    {
      schema: {
        tags,
        operationId: 'listTestimonials',
        summary: 'Active testimonials, ordered for display',
        querystring: paginationQuerySchema,
        response: { 200: testimonialListResponseSchema, ...errorResponses },
      },
    },
    async (request) => service.listTestimonials(request.query),
  );

  app.get(
    '/onboarding',
    {
      schema: {
        tags,
        operationId: 'getOnboardingContent',
        summary: 'Onboarding page configuration (headline, VSL, funnel steps)',
        response: { 200: onboardingResponseSchema, ...errorResponses },
      },
    },
    async () => ({ data: await service.getOnboarding() }),
  );
};
