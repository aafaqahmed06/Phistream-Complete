import { describe, expect, it } from 'vitest';

import { realServiceTiers } from '../../src/db/content/service-tiers.js';

describe('real service tiers', () => {
  it('has the three founder and three creator tiers, in order', () => {
    expect(realServiceTiers.map((t) => t.slug)).toEqual([
      'founder-starter',
      'founder-build',
      'founder-scale',
      'creator-starter',
      'creator-operator',
      'creator-represented',
    ]);
    expect(realServiceTiers.map((t) => t.displayOrder)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('respects the table constraints', () => {
    for (const tier of realServiceTiers) {
      expect(tier.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(tier.name.length).toBeLessThanOrEqual(200);
      expect(tier.billingPeriod.length).toBeLessThanOrEqual(50);
      expect(Number.isInteger(tier.priceAmount)).toBe(true);
      expect(tier.priceAmount).toBeGreaterThan(0);
    }
  });

  it('publishes the USD floors from the pricing document, in cents', () => {
    const floors = Object.fromEntries(realServiceTiers.map((t) => [t.slug, t.priceAmount / 100]));
    expect(floors).toEqual({
      'founder-starter': 3_500,
      'founder-build': 15_000,
      'founder-scale': 35_000,
      'creator-starter': 2_500,
      'creator-operator': 8_000,
      'creator-represented': 12_000,
    });
  });

  it('shows every price as a floor, with the PKR floor and the discovery-call gate', () => {
    for (const tier of realServiceTiers) {
      const text = tier.features.join(' | ');
      expect(text).toMatch(/From \$[\d,]+/);
      expect(text).toContain('PKR');
      expect(text).toContain('discovery call');
    }
  });
});
