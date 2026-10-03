import type {
  ContentRepository,
  FaqRow,
  PageWindow,
  ServiceTierRow,
  SiteConfigRow,
  TestimonialRow,
} from '../../src/modules/content/content.repository.js';

type WithFlags<T> = T & { isActive: boolean; displayOrder: number };

export interface FakeContentData {
  serviceTiers?: WithFlags<ServiceTierRow>[];
  faqs?: WithFlags<FaqRow>[];
  testimonials?: WithFlags<TestimonialRow>[];
  siteConfig?: (SiteConfigRow & { isPublic: boolean })[];
}

/**
 * In-memory ContentRepository mirroring the real filters (active/public,
 * display order, paging). The real SQL is covered by tests/db/content.test.ts.
 */
export function createFakeContentRepository(data: FakeContentData = {}): ContentRepository {
  function page<T extends { isActive: boolean; displayOrder: number; id: string }>(
    rows: T[] | undefined,
    window: PageWindow,
  ) {
    const active = (rows ?? [])
      .filter((row) => row.isActive)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.id.localeCompare(b.id));
    return {
      items: active.slice(window.offset, window.offset + window.limit),
      total: active.length,
    };
  }

  return {
    listActiveServiceTiers: (window) => Promise.resolve(page(data.serviceTiers, window)),
    listActiveFaqs: (window) => Promise.resolve(page(data.faqs, window)),
    listActiveTestimonials: (window) => Promise.resolve(page(data.testimonials, window)),
    findActiveServiceTierBySlug: (slug) =>
      Promise.resolve(data.serviceTiers?.find((row) => row.slug === slug && row.isActive)),
    findPublicSiteConfig: (keys) =>
      Promise.resolve(
        (data.siteConfig ?? [])
          .filter((row) => row.isPublic && keys.includes(row.key))
          .map(({ key, value }) => ({ key, value })),
      ),
  };
}

export const uuid = (n: number): string => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function tier(
  n: number,
  overrides: Partial<WithFlags<ServiceTierRow>> = {},
): WithFlags<ServiceTierRow> {
  return {
    id: uuid(n),
    slug: `tier-${n}`,
    name: `Tier ${n}`,
    description: `Description ${n}`,
    priceAmount: null,
    currency: null,
    billingPeriod: null,
    features: [],
    isActive: true,
    displayOrder: n,
    ...overrides,
  };
}

export function faq(n: number, overrides: Partial<WithFlags<FaqRow>> = {}): WithFlags<FaqRow> {
  return {
    id: uuid(100 + n),
    question: `Question ${n}?`,
    answer: `Answer ${n}.`,
    isActive: true,
    displayOrder: n,
    ...overrides,
  };
}

export function testimonial(
  n: number,
  overrides: Partial<WithFlags<TestimonialRow>> = {},
): WithFlags<TestimonialRow> {
  return {
    id: uuid(200 + n),
    name: `Person ${n}`,
    role: null,
    company: null,
    quote: `Quote ${n}.`,
    avatarUrl: null,
    isActive: true,
    displayOrder: n,
    ...overrides,
  };
}
