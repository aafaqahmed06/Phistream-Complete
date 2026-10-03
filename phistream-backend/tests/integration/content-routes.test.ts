import { afterEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type {
  HomeContent,
  Paginated,
  PublicFaq,
  PublicTestimonial,
} from '../../src/modules/content/content.schemas.js';
import {
  createContentService,
  type ContentService,
} from '../../src/modules/content/content.service.js';
import {
  createFakeContentRepository,
  faq,
  testimonial,
  tier,
  type FakeContentData,
} from '../helpers/fake-content.js';
import { buildTestApp, testConfig } from '../helpers/test-app.js';

const silentLogger = { warn: () => undefined };

async function appWith(data: FakeContentData = {}, env: Record<string, string> = {}) {
  return buildApp({
    config: testConfig(env),
    services: {
      content: createContentService({
        repository: createFakeContentRepository(data),
        logger: silentLogger,
      }),
    },
  });
}

describe('content routes', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  describe('response shapes', () => {
    it('GET /api/v1/content/services returns { data, pagination }', async () => {
      app = await appWith({ serviceTiers: [tier(1, { priceAmount: 500, currency: 'XTS' })] });
      const response = await app.inject('/api/v1/content/services');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        data: [
          {
            id: tier(1).id,
            slug: 'tier-1',
            name: 'Tier 1',
            description: 'Description 1',
            price: { amountMinor: 500, currency: 'XTS' },
            billingPeriod: null,
            features: [],
          },
        ],
        pagination: { limit: 20, offset: 0, total: 1 },
      });
    });

    it('GET /api/v1/content/services/:slug returns { data }', async () => {
      app = await appWith({ serviceTiers: [tier(1)] });
      const response = await app.inject('/api/v1/content/services/tier-1');

      expect(response.statusCode).toBe(200);
      expect(response.json().data.slug).toBe('tier-1');
    });

    it('GET /api/v1/content/faqs and /testimonials return lists', async () => {
      app = await appWith({ faqs: [faq(1)], testimonials: [testimonial(1)] });

      const faqs = await app.inject('/api/v1/content/faqs');
      const testimonials = await app.inject('/api/v1/content/testimonials');

      expect(faqs.json()).toEqual({
        data: [{ id: faq(1).id, question: 'Question 1?', answer: 'Answer 1.' }],
        pagination: { limit: 20, offset: 0, total: 1 },
      });
      expect(
        Object.keys(testimonials.json<Paginated<PublicTestimonial>>().data[0] ?? {}).sort(),
      ).toEqual(['avatarUrl', 'company', 'id', 'name', 'quote', 'role']);
    });

    it('GET /api/v1/content/home returns the aggregate', async () => {
      app = await appWith({ serviceTiers: [tier(1)] });
      const response = await app.inject('/api/v1/content/home');

      expect(response.statusCode).toBe(200);
      expect(Object.keys(response.json<{ data: HomeContent }>().data).sort()).toEqual([
        'contact',
        'faqs',
        'services',
        'socialLinks',
        'testimonials',
      ]);
    });

    it('GET /api/v1/content/onboarding returns headline, vsl, steps', async () => {
      app = await appWith();
      const response = await app.inject('/api/v1/content/onboarding');

      expect(response.json()).toEqual({
        data: { headline: null, vsl: { url: null }, steps: [] },
      });
    });
  });

  describe('visibility', () => {
    it('returns 404 NOT_FOUND for an inactive service', async () => {
      app = await appWith({ serviceTiers: [tier(1, { isActive: false })] });
      const response = await app.inject('/api/v1/content/services/tier-1');

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });

    it('strips fields that are not in the public contract (defense in depth)', async () => {
      const leaky: ContentService = {
        ...createContentService({
          repository: createFakeContentRepository(),
          logger: silentLogger,
        }),
        listFaqs: () =>
          Promise.resolve({
            data: [
              {
                id: faq(1).id,
                question: 'Q?',
                answer: 'A.',
                isActive: false,
                internalNote: 'secret',
              } as never,
            ],
            pagination: { limit: 20, offset: 0, total: 1 },
          }),
      };
      app = await buildApp({ config: testConfig(), services: { content: leaky } });
      const response = await app.inject('/api/v1/content/faqs');

      expect(response.statusCode).toBe(200);
      expect(response.json().data[0]).toEqual({ id: faq(1).id, question: 'Q?', answer: 'A.' });
    });
  });

  describe('input validation', () => {
    it.each(['Tier-1', 'tier_1', 'tier--1', '-tier', '%20'])(
      'rejects invalid slug %j with VALIDATION_ERROR',
      async (slug) => {
        app = await appWith();
        const response = await app.inject(`/api/v1/content/services/${encodeURIComponent(slug)}`);

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION_ERROR');
        expect(response.json().error.details[0].location).toBe('params');
      },
    );

    it('rejects over-long slugs at the router (414) with the error envelope', async () => {
      app = await appWith();
      const response = await app.inject(`/api/v1/content/services/${'a'.repeat(101)}`);

      expect(response.statusCode).toBe(414);
      expect(response.json().error.code).toBe('BAD_REQUEST');
    });

    it.each(['limit=0', 'limit=101', 'limit=abc', 'offset=-1', 'offset=10001', 'limit=1.5'])(
      'rejects invalid pagination %s',
      async (query) => {
        app = await appWith();
        const response = await app.inject(`/api/v1/content/faqs?${query}`);

        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION_ERROR');
      },
    );

    it('honours valid pagination parameters', async () => {
      app = await appWith({ faqs: [faq(1), faq(2), faq(3)] });
      const response = await app.inject('/api/v1/content/faqs?limit=1&offset=1');

      expect(response.json<Paginated<PublicFaq>>().data.map((f) => f.question)).toEqual([
        'Question 2?',
      ]);
      expect(response.json().pagination).toEqual({ limit: 1, offset: 1, total: 3 });
    });
  });

  describe('caching', () => {
    it('marks successful responses as publicly cacheable', async () => {
      app = await appWith({ serviceTiers: [tier(1)] });
      const response = await app.inject('/api/v1/content/services');

      expect(response.headers['cache-control']).toBe(
        'public, max-age=60, stale-while-revalidate=300',
      );
    });

    it('does not mark errors as cacheable', async () => {
      app = await appWith();
      const response = await app.inject('/api/v1/content/services/missing');

      expect(response.statusCode).toBe(404);
      expect(response.headers['cache-control']).toBeUndefined();
    });

    it('uses no-cache when CONTENT_CACHE_MAX_AGE_SECONDS=0', async () => {
      app = await appWith({}, { CONTENT_CACHE_MAX_AGE_SECONDS: '0' });
      const response = await app.inject('/api/v1/content/faqs');

      expect(response.headers['cache-control']).toBe('no-cache');
    });
  });

  describe('wiring', () => {
    it('does not register content routes without a database or service', async () => {
      app = await buildTestApp();
      const response = await app.inject('/api/v1/content/services');

      expect(response.statusCode).toBe(404);
    });

    it('documents every content endpoint in OpenAPI with an operationId', async () => {
      app = await appWith();
      await app.ready();
      const spec = app.swagger() as {
        paths: Record<string, { get?: { operationId?: string; tags?: string[] } }>;
        components?: { schemas?: Record<string, unknown> };
      };

      const operations = Object.entries(spec.paths)
        .filter(([path]) => path.startsWith('/api/v1/content/'))
        .map(([path, item]) => [path, item.get?.operationId]);
      expect(Object.fromEntries(operations)).toEqual({
        '/api/v1/content/home': 'getHomeContent',
        '/api/v1/content/services': 'listServices',
        '/api/v1/content/services/{slug}': 'getService',
        '/api/v1/content/faqs': 'listFaqs',
        '/api/v1/content/testimonials': 'listTestimonials',
        '/api/v1/content/onboarding': 'getOnboardingContent',
      });
      expect(spec.components?.schemas).toHaveProperty('PublicServiceTier');
      expect(spec.components?.schemas).toHaveProperty('Pagination');
      expect(spec.components?.schemas).toHaveProperty('OnboardingContent');
    });
  });
});
