import { describe, expect, it } from 'vitest';

import {
  isPublicSiteConfigKey,
  parsePublicSiteConfig,
} from '../../src/modules/content/site-config.registry.js';

describe('public site config registry', () => {
  it('only recognises registered keys', () => {
    expect(isPublicSiteConfigKey('onboarding.vsl_url')).toBe(true);
    expect(isPublicSiteConfigKey('internal.secret')).toBe(false);
    expect(isPublicSiteConfigKey('toString')).toBe(false);
    expect(isPublicSiteConfigKey('__proto__')).toBe(false);
  });

  it('drops unregistered keys even if present', () => {
    const { config, invalidKeys } = parsePublicSiteConfig([
      { key: 'internal.api_key', value: 'secret' },
      { key: 'contact.email', value: 'hello@example.com' },
    ]);
    expect(config).toEqual({ 'contact.email': 'hello@example.com' });
    expect(invalidKeys).toEqual([]);
  });

  it.each([
    ['onboarding.vsl_url', 'http://example.com/video'],
    ['onboarding.vsl_url', 'javascript:alert(1)'],
    ['contact.email', 'not-an-email'],
    ['social.links', [{ label: 'X', url: 'ftp://example.com' }]],
    ['onboarding.steps', 'not an array'],
    ['onboarding.headline', ''],
  ])('rejects an invalid %s value', (key, value) => {
    const { config, invalidKeys } = parsePublicSiteConfig([{ key, value }]);
    expect(config).toEqual({});
    expect(invalidKeys).toEqual([key]);
  });

  it('normalizes onboarding steps (missing description -> null)', () => {
    const { config } = parsePublicSiteConfig([
      { key: 'onboarding.steps', value: [{ title: ' Watch ' }] },
    ]);
    expect(config['onboarding.steps']).toEqual([{ title: 'Watch', description: null }]);
  });
});
