import { z } from 'zod';

import { PUBLIC_SITE_CONFIG } from './site-config.registry.js';

/**
 * Public content contracts.
 *
 * These schemas are also the response serializers: any field not listed here
 * is stripped from the response, so private columns (is_active, timestamps,
 * display_order, ...) cannot leak even if a query selected them.
 */

// ---- Requests -----------------------------------------------------------------

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const serviceSlugParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(SLUG_PATTERN, 'must be lowercase letters, numbers, and single hyphens'),
});

export const PAGINATION_DEFAULT_LIMIT = 20;
export const PAGINATION_MAX_LIMIT = 100;
export const PAGINATION_MAX_OFFSET = 10_000;

export const paginationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(PAGINATION_MAX_LIMIT)
    .default(PAGINATION_DEFAULT_LIMIT)
    .describe(`Items per page (1-${PAGINATION_MAX_LIMIT})`),
  offset: z.coerce
    .number()
    .int()
    .min(0)
    .max(PAGINATION_MAX_OFFSET)
    .default(0)
    .describe('Number of items to skip'),
});

export type PageRequest = z.output<typeof paginationQuerySchema>;

// ---- Resources ----------------------------------------------------------------

export const publicServiceTierSchema = z
  .object({
    id: z.uuid(),
    slug: z.string(),
    name: z.string(),
    description: z.string(),
    price: z
      .object({
        amountMinor: z
          .number()
          .int()
          .describe('Price in minor currency units (e.g. cents): 150000 = 1500.00'),
        currency: z.string().describe('ISO 4217 currency code'),
      })
      .nullable()
      .describe('Null when the price is not published'),
    billingPeriod: z.string().nullable(),
    features: z.array(z.string()),
  })
  .meta({ id: 'PublicServiceTier' });

export const publicFaqSchema = z
  .object({
    id: z.uuid(),
    question: z.string(),
    answer: z.string(),
  })
  .meta({ id: 'PublicFaq' });

export const publicTestimonialSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    role: z.string().nullable(),
    company: z.string().nullable(),
    quote: z.string(),
    avatarUrl: z.string().nullable(),
  })
  .meta({ id: 'PublicTestimonial' });

export type PublicServiceTier = z.infer<typeof publicServiceTierSchema>;
export type PublicFaq = z.infer<typeof publicFaqSchema>;
export type PublicTestimonial = z.infer<typeof publicTestimonialSchema>;

export const paginationSchema = z
  .object({
    limit: z.number().int(),
    offset: z.number().int(),
    total: z.number().int().describe('Total number of items available'),
  })
  .meta({ id: 'Pagination' });

export type Pagination = z.infer<typeof paginationSchema>;

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

// ---- Aggregates ---------------------------------------------------------------

export const homeContentSchema = z
  .object({
    contact: z.object({
      email: z.string().nullable(),
      phone: z.string().nullable(),
    }),
    socialLinks: PUBLIC_SITE_CONFIG['social.links'],
    services: z.array(publicServiceTierSchema),
    faqs: z.array(publicFaqSchema),
    testimonials: z.array(publicTestimonialSchema),
  })
  .meta({ id: 'HomeContent' });

export const onboardingContentSchema = z
  .object({
    headline: z.string().nullable(),
    vsl: z.object({
      url: z.string().nullable().describe('Video sales letter URL (https), if configured'),
    }),
    steps: PUBLIC_SITE_CONFIG['onboarding.steps'],
  })
  .meta({ id: 'OnboardingContent' });

export type HomeContent = z.infer<typeof homeContentSchema>;
export type OnboardingContent = z.infer<typeof onboardingContentSchema>;

// ---- Response envelopes ---------------------------------------------------------

const listOf = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), pagination: paginationSchema });

export const serviceListResponseSchema = listOf(publicServiceTierSchema);
export const serviceResponseSchema = z.object({ data: publicServiceTierSchema });
export const faqListResponseSchema = listOf(publicFaqSchema);
export const testimonialListResponseSchema = listOf(publicTestimonialSchema);
export const homeResponseSchema = z.object({ data: homeContentSchema });
export const onboardingResponseSchema = z.object({ data: onboardingContentSchema });
