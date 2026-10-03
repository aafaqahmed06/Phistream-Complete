import { z } from 'zod';

/**
 * Typed allow-list of site_config keys that public endpoints may serve.
 *
 * A row is served publicly only when BOTH:
 *   1. its key is registered here, and
 *   2. the row has `is_public = true`.
 * Its value must also match the schema below; invalid values are ignored
 * (and logged by key, never by value) rather than breaking the page.
 *
 * The admin content API (Phase 5) should validate writes with the same
 * schemas. The *values* are business content supplied by Phistream Studio;
 * only the shapes are defined here.
 */

const httpsUrl = z.url({ protocol: /^https$/, error: 'must be an https URL' }).max(2048);

export const PUBLIC_SITE_CONFIG = {
  /** Public contact email address. */
  'contact.email': z.email().max(320),
  /** Public contact phone number, as it should be displayed. */
  'contact.phone': z.string().trim().min(1).max(50),
  /** Social profile links shown on the site. */
  'social.links': z
    .array(
      z.object({
        label: z.string().trim().min(1).max(50),
        url: httpsUrl,
      }),
    )
    .max(20),
  /** Headline shown on the onboarding page. */
  'onboarding.headline': z.string().trim().min(1).max(300),
  /** Video sales letter URL (embed or hosted page). */
  'onboarding.vsl_url': httpsUrl,
  /** Ordered steps of the onboarding funnel shown to visitors. */
  'onboarding.steps': z
    .array(
      z.object({
        title: z.string().trim().min(1).max(100),
        description: z.string().trim().max(500).nullable().default(null),
      }),
    )
    .max(10),
} as const satisfies Record<string, z.ZodType>;

export type PublicSiteConfigKey = keyof typeof PUBLIC_SITE_CONFIG;

export type PublicSiteConfig = {
  [K in PublicSiteConfigKey]?: z.output<(typeof PUBLIC_SITE_CONFIG)[K]>;
};

export const PUBLIC_SITE_CONFIG_KEYS = Object.keys(PUBLIC_SITE_CONFIG) as PublicSiteConfigKey[];

export function isPublicSiteConfigKey(key: string): key is PublicSiteConfigKey {
  return Object.hasOwn(PUBLIC_SITE_CONFIG, key);
}

export interface SiteConfigParseResult {
  readonly config: PublicSiteConfig;
  /** Registered keys whose stored value failed validation. */
  readonly invalidKeys: PublicSiteConfigKey[];
}

/** Validates raw rows against the registry; unregistered keys are dropped. */
export function parsePublicSiteConfig(
  rows: readonly { key: string; value: unknown }[],
): SiteConfigParseResult {
  const config: Record<string, unknown> = {};
  const invalidKeys: PublicSiteConfigKey[] = [];

  for (const { key, value } of rows) {
    if (!isPublicSiteConfigKey(key)) continue;
    const parsed = PUBLIC_SITE_CONFIG[key].safeParse(value);
    if (parsed.success) config[key] = parsed.data;
    else invalidKeys.push(key);
  }

  return { config, invalidKeys };
}
