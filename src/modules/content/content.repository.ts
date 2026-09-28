import { and, asc, count, eq, inArray } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { faqs, serviceTiers, siteConfig, testimonials } from '../../db/schema/index.js';

/**
 * Read-only data access for PUBLIC content.
 *
 * Every query here filters on the publish flag (`is_active` / `is_public`) and
 * selects an explicit column list, so unpublished rows and internal columns
 * never leave the database through this module.
 */

export interface PageWindow {
  readonly limit: number;
  readonly offset: number;
}

export interface PageResult<T> {
  readonly items: T[];
  readonly total: number;
}

export interface ServiceTierRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceAmount: number | null;
  currency: string | null;
  billingPeriod: string | null;
  features: unknown;
}

export interface FaqRow {
  id: string;
  question: string;
  answer: string;
}

export interface TestimonialRow {
  id: string;
  name: string;
  role: string | null;
  company: string | null;
  quote: string;
  avatarUrl: string | null;
}

export interface SiteConfigRow {
  key: string;
  value: unknown;
}

export interface ContentRepository {
  listActiveServiceTiers(page: PageWindow): Promise<PageResult<ServiceTierRow>>;
  findActiveServiceTierBySlug(slug: string): Promise<ServiceTierRow | undefined>;
  listActiveFaqs(page: PageWindow): Promise<PageResult<FaqRow>>;
  listActiveTestimonials(page: PageWindow): Promise<PageResult<TestimonialRow>>;
  /** Public rows for the given keys only. */
  findPublicSiteConfig(keys: readonly string[]): Promise<SiteConfigRow[]>;
}

const serviceTierColumns = {
  id: serviceTiers.id,
  slug: serviceTiers.slug,
  name: serviceTiers.name,
  description: serviceTiers.description,
  priceAmount: serviceTiers.priceAmount,
  currency: serviceTiers.currency,
  billingPeriod: serviceTiers.billingPeriod,
  features: serviceTiers.features,
};

const faqColumns = { id: faqs.id, question: faqs.question, answer: faqs.answer };

const testimonialColumns = {
  id: testimonials.id,
  name: testimonials.name,
  role: testimonials.role,
  company: testimonials.company,
  quote: testimonials.quote,
  avatarUrl: testimonials.avatarUrl,
};

/** Runs a page query and its total count concurrently. */
async function withTotal<T>(
  items: Promise<T[]>,
  totals: Promise<{ total: number }[]>,
): Promise<PageResult<T>> {
  const [rows, counted] = await Promise.all([items, totals]);
  return { items: rows, total: counted[0]?.total ?? 0 };
}

export function createContentRepository(db: Db): ContentRepository {
  const activeTier = eq(serviceTiers.isActive, true);
  const activeFaq = eq(faqs.isActive, true);
  const activeTestimonial = eq(testimonials.isActive, true);

  return {
    // Ordered by display_order, with id as a stable tie-breaker for paging.
    listActiveServiceTiers: (page) =>
      withTotal(
        db
          .select(serviceTierColumns)
          .from(serviceTiers)
          .where(activeTier)
          .orderBy(asc(serviceTiers.displayOrder), asc(serviceTiers.id))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(serviceTiers).where(activeTier),
      ),

    listActiveFaqs: (page) =>
      withTotal(
        db
          .select(faqColumns)
          .from(faqs)
          .where(activeFaq)
          .orderBy(asc(faqs.displayOrder), asc(faqs.id))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(faqs).where(activeFaq),
      ),

    listActiveTestimonials: (page) =>
      withTotal(
        db
          .select(testimonialColumns)
          .from(testimonials)
          .where(activeTestimonial)
          .orderBy(asc(testimonials.displayOrder), asc(testimonials.id))
          .limit(page.limit)
          .offset(page.offset),
        db.select({ total: count() }).from(testimonials).where(activeTestimonial),
      ),

    async findActiveServiceTierBySlug(slug) {
      const rows = await db
        .select(serviceTierColumns)
        .from(serviceTiers)
        .where(and(eq(serviceTiers.slug, slug), activeTier))
        .limit(1);
      return rows[0];
    },

    async findPublicSiteConfig(keys) {
      if (keys.length === 0) return [];
      return db
        .select({ key: siteConfig.key, value: siteConfig.value })
        .from(siteConfig)
        .where(and(eq(siteConfig.isPublic, true), inArray(siteConfig.key, [...keys])));
    },
  };
}
