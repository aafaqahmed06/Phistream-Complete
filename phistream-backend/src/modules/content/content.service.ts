import { AppError } from '../../shared/errors/app-error.js';
import type {
  ContentRepository,
  FaqRow,
  PageResult,
  ServiceTierRow,
  TestimonialRow,
} from './content.repository.js';
import {
  PAGINATION_DEFAULT_LIMIT,
  PAGINATION_MAX_LIMIT,
  type HomeContent,
  type OnboardingContent,
  type PageRequest,
  type Paginated,
  type PublicFaq,
  type PublicServiceTier,
  type PublicTestimonial,
} from './content.schemas.js';
import {
  parsePublicSiteConfig,
  type PublicSiteConfig,
  type PublicSiteConfigKey,
} from './site-config.registry.js';

export interface ContentServiceLogger {
  warn(object: object, message: string): void;
}

/**
 * How many items each home-page section includes. Full lists are available
 * from the dedicated paginated endpoints.
 */
export const HOME_SECTION_LIMITS = {
  services: PAGINATION_MAX_LIMIT,
  faqs: PAGINATION_DEFAULT_LIMIT,
  testimonials: PAGINATION_DEFAULT_LIMIT,
} as const;

const HOME_CONFIG_KEYS = [
  'contact.email',
  'contact.phone',
  'social.links',
] as const satisfies readonly PublicSiteConfigKey[];

const ONBOARDING_CONFIG_KEYS = [
  'onboarding.headline',
  'onboarding.vsl_url',
  'onboarding.steps',
] as const satisfies readonly PublicSiteConfigKey[];

export interface ContentService {
  listServices(page: PageRequest): Promise<Paginated<PublicServiceTier>>;
  getService(slug: string): Promise<PublicServiceTier>;
  listFaqs(page: PageRequest): Promise<Paginated<PublicFaq>>;
  listTestimonials(page: PageRequest): Promise<Paginated<PublicTestimonial>>;
  getHome(): Promise<HomeContent>;
  getOnboarding(): Promise<OnboardingContent>;
}

// ---- Mapping (row -> public DTO) --------------------------------------------------

export function toPublicServiceTier(row: ServiceTierRow): PublicServiceTier {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    price:
      row.priceAmount !== null && row.currency !== null
        ? { amountMinor: row.priceAmount, currency: row.currency }
        : null,
    billingPeriod: row.billingPeriod,
    // JSONB is only constrained to be an array; serve string entries only.
    features: Array.isArray(row.features)
      ? row.features.filter((feature): feature is string => typeof feature === 'string')
      : [],
  };
}

export function toPublicFaq(row: FaqRow): PublicFaq {
  return { id: row.id, question: row.question, answer: row.answer };
}

export function toPublicTestimonial(row: TestimonialRow): PublicTestimonial {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    company: row.company,
    quote: row.quote,
    avatarUrl: row.avatarUrl,
  };
}

function paginate<Row, Dto>(
  result: PageResult<Row>,
  page: PageRequest,
  map: (row: Row) => Dto,
): Paginated<Dto> {
  return {
    data: result.items.map(map),
    pagination: { limit: page.limit, offset: page.offset, total: result.total },
  };
}

// ---- Service ------------------------------------------------------------------------

export function createContentService(deps: {
  repository: ContentRepository;
  logger: ContentServiceLogger;
}): ContentService {
  const { repository, logger } = deps;

  async function loadConfig(keys: readonly PublicSiteConfigKey[]): Promise<PublicSiteConfig> {
    const rows = await repository.findPublicSiteConfig(keys);
    const { config, invalidKeys } = parsePublicSiteConfig(rows);
    if (invalidKeys.length > 0) {
      // Keys only: values are business content and may be large.
      logger.warn({ invalidKeys }, 'ignoring public site_config values that fail validation');
    }
    return config;
  }

  return {
    async listServices(page) {
      return paginate(await repository.listActiveServiceTiers(page), page, toPublicServiceTier);
    },

    async getService(slug) {
      const row = await repository.findActiveServiceTierBySlug(slug);
      // Inactive and missing tiers are indistinguishable to the public.
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Service not found.');
      return toPublicServiceTier(row);
    },

    async listFaqs(page) {
      return paginate(await repository.listActiveFaqs(page), page, toPublicFaq);
    },

    async listTestimonials(page) {
      return paginate(await repository.listActiveTestimonials(page), page, toPublicTestimonial);
    },

    async getHome() {
      const first = (limit: number) => ({ limit, offset: 0 });
      const [config, services, faqs, testimonials] = await Promise.all([
        loadConfig(HOME_CONFIG_KEYS),
        repository.listActiveServiceTiers(first(HOME_SECTION_LIMITS.services)),
        repository.listActiveFaqs(first(HOME_SECTION_LIMITS.faqs)),
        repository.listActiveTestimonials(first(HOME_SECTION_LIMITS.testimonials)),
      ]);

      return {
        contact: {
          email: config['contact.email'] ?? null,
          phone: config['contact.phone'] ?? null,
        },
        socialLinks: config['social.links'] ?? [],
        services: services.items.map(toPublicServiceTier),
        faqs: faqs.items.map(toPublicFaq),
        testimonials: testimonials.items.map(toPublicTestimonial),
      };
    },

    async getOnboarding() {
      const config = await loadConfig(ONBOARDING_CONFIG_KEYS);
      return {
        headline: config['onboarding.headline'] ?? null,
        vsl: { url: config['onboarding.vsl_url'] ?? null },
        steps: config['onboarding.steps'] ?? [],
      };
    },
  };
}
