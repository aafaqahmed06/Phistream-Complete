import { describe, expect, it, vi } from 'vitest';

import { AppError } from '../../src/shared/errors/app-error.js';
import {
  createContentService,
  HOME_SECTION_LIMITS,
} from '../../src/modules/content/content.service.js';
import {
  createFakeContentRepository,
  faq,
  testimonial,
  tier,
  type FakeContentData,
} from '../helpers/fake-content.js';

function setup(data: FakeContentData = {}) {
  const logger = { warn: vi.fn() };
  const service = createContentService({ repository: createFakeContentRepository(data), logger });
  return { service, logger };
}

const firstPage = { limit: 20, offset: 0 };

describe('content service', () => {
  describe('services', () => {
    it('lists only active tiers in display order with pagination metadata', async () => {
      const { service } = setup({
        serviceTiers: [tier(2), tier(1), tier(3, { isActive: false })],
      });
      const result = await service.listServices(firstPage);

      expect(result.data.map((t) => t.slug)).toEqual(['tier-1', 'tier-2']);
      expect(result.pagination).toEqual({ limit: 20, offset: 0, total: 2 });
    });

    it('pages through results', async () => {
      const { service } = setup({ serviceTiers: [tier(1), tier(2), tier(3)] });
      const result = await service.listServices({ limit: 2, offset: 2 });

      expect(result.data.map((t) => t.slug)).toEqual(['tier-3']);
      expect(result.pagination.total).toBe(3);
    });

    it('maps price only when amount and currency are both present', async () => {
      const { service } = setup({
        serviceTiers: [tier(1, { priceAmount: 150_000, currency: 'XTS' }), tier(2)],
      });
      const [priced, unpriced] = (await service.listServices(firstPage)).data;

      expect(priced?.price).toEqual({ amountMinor: 150_000, currency: 'XTS' });
      expect(unpriced?.price).toBeNull();
    });

    it('serves only string features', async () => {
      const { service } = setup({
        serviceTiers: [tier(1, { features: ['A', 42, { b: 1 }, 'C'] })],
      });
      expect((await service.getService('tier-1')).features).toEqual(['A', 'C']);
    });

    it('never exposes internal fields', async () => {
      const { service } = setup({ serviceTiers: [tier(1)] });
      expect(Object.keys(await service.getService('tier-1')).sort()).toEqual([
        'billingPeriod',
        'description',
        'features',
        'id',
        'name',
        'price',
        'slug',
      ]);
    });

    it.each([
      ['missing', 'tier-9'],
      ['inactive', 'tier-2'],
    ])('treats a %s tier as not found', async (_, slug) => {
      const { service } = setup({ serviceTiers: [tier(1), tier(2, { isActive: false })] });
      const error = await service.getService(slug).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 404, code: 'NOT_FOUND' });
    });
  });

  describe('faqs and testimonials', () => {
    it('list only active rows', async () => {
      const { service } = setup({
        faqs: [faq(1), faq(2, { isActive: false })],
        testimonials: [testimonial(1, { isActive: false }), testimonial(2)],
      });

      expect((await service.listFaqs(firstPage)).data.map((f) => f.question)).toEqual([
        'Question 1?',
      ]);
      expect((await service.listTestimonials(firstPage)).data.map((t) => t.name)).toEqual([
        'Person 2',
      ]);
    });
  });

  describe('home', () => {
    it('combines public config with the first page of each section', async () => {
      const { service } = setup({
        serviceTiers: [tier(1)],
        faqs: Array.from({ length: HOME_SECTION_LIMITS.faqs + 5 }, (_, i) => faq(i + 1)),
        testimonials: [testimonial(1)],
        siteConfig: [
          { key: 'contact.email', value: 'hello@example.com', isPublic: true },
          { key: 'contact.phone', value: '+1 555-0100', isPublic: false },
          {
            key: 'social.links',
            value: [{ label: 'A', url: 'https://example.com/a' }],
            isPublic: true,
          },
        ],
      });
      const home = await service.getHome();

      expect(home.contact).toEqual({ email: 'hello@example.com', phone: null });
      expect(home.socialLinks).toEqual([{ label: 'A', url: 'https://example.com/a' }]);
      expect(home.services).toHaveLength(1);
      expect(home.faqs).toHaveLength(HOME_SECTION_LIMITS.faqs);
      expect(home.testimonials).toHaveLength(1);
    });

    it('returns empty defaults when nothing is configured', async () => {
      const { service } = setup();
      expect(await service.getHome()).toEqual({
        contact: { email: null, phone: null },
        socialLinks: [],
        services: [],
        faqs: [],
        testimonials: [],
      });
    });
  });

  describe('onboarding', () => {
    it('returns public onboarding config', async () => {
      const { service } = setup({
        siteConfig: [
          { key: 'onboarding.headline', value: 'Headline', isPublic: true },
          { key: 'onboarding.vsl_url', value: 'https://example.com/vsl', isPublic: true },
          { key: 'onboarding.steps', value: [{ title: 'One' }], isPublic: true },
        ],
      });

      expect(await service.getOnboarding()).toEqual({
        headline: 'Headline',
        vsl: { url: 'https://example.com/vsl' },
        steps: [{ title: 'One', description: null }],
      });
    });

    it('ignores invalid values and logs the key without the value', async () => {
      const { service, logger } = setup({
        siteConfig: [{ key: 'onboarding.vsl_url', value: 'javascript:alert(1)', isPublic: true }],
      });

      expect((await service.getOnboarding()).vsl.url).toBeNull();
      expect(logger.warn).toHaveBeenCalledWith(
        { invalidKeys: ['onboarding.vsl_url'] },
        expect.any(String),
      );
      expect(JSON.stringify(logger.warn.mock.calls)).not.toContain('javascript');
    });

    it('does not serve private config', async () => {
      const { service } = setup({
        siteConfig: [{ key: 'onboarding.headline', value: 'Draft', isPublic: false }],
      });
      expect((await service.getOnboarding()).headline).toBeNull();
    });
  });
});
