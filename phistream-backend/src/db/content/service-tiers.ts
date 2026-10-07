import { and, eq, inArray } from 'drizzle-orm';

import type { Db } from '../client.js';
import { demoId } from '../seed/demo-data.js';
import { serviceTiers } from '../schema/index.js';

/**
 * The real service tiers, from "Phistreams — Offers & Pricing" (5 Oct 2026).
 *
 * PUBLISHED FIGURES ARE FLOORS ONLY. Every price below is a "From" price; the
 * internal quoting bands in the pricing document are deliberately NOT stored
 * here, because everything in this table is served by public endpoints.
 *
 * One row per tier (six in all), not one per currency. The structured price is
 * the USD floor (minor units = cents). The PKR floor for clients in Pakistan
 * is in the description and features, because a row carries a single currency.
 * PKR figures assume roughly 1 USD = PKR 280: confirm the live rate before
 * changing them.
 *
 * Every engagement is gated behind a discovery call, so each tier says so.
 */

interface RealTier {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  /** USD floor in cents. */
  readonly priceAmount: number;
  readonly currency: 'USD';
  readonly billingPeriod: string;
  readonly displayOrder: number;
  readonly features: readonly string[];
}

const DISCOVERY = 'Every engagement starts with a discovery call; pricing is confirmed after it';

export const realServiceTiers: readonly RealTier[] = [
  {
    slug: 'founder-starter',
    name: 'Founder · Starter — Positioning Consult & 6-Month Roadmap',
    description:
      'The entry point for a founder who is not ready to commission a full identity yet. A positioning and market audit, two strategy sessions, and a written six-month plan covering brand presence, content direction and scaling priorities. This is the plan, not the execution: no design or build work.',
    priceAmount: 350_000,
    currency: 'USD',
    billingPeriod: 'one-off',
    displayOrder: 1,
    features: [
      'Positioning and market audit',
      'Two strategy sessions',
      'Written six-month step-by-step plan',
      'From $3,500 · From PKR 150,000 for clients in Pakistan',
      DISCOVERY,
    ],
  },
  {
    slug: 'founder-build',
    name: 'Founder · Build — Full Brand Identity + Website',
    description:
      'For a founder who already knows what they want built. Full brand identity and a 5–8 page website, built and launched. No content plan or ongoing social strategy at this tier.',
    priceAmount: 1_500_000,
    currency: 'USD',
    billingPeriod: 'project',
    displayOrder: 2,
    features: [
      'Full brand identity: logo, palette, typography, guidelines',
      '5–8 page website, built and launched',
      'From $15,000 · From PKR 700,000 for clients in Pakistan',
      DISCOVERY,
    ],
  },
  {
    slug: 'founder-scale',
    name: 'Founder · Scale — Identity, Website, Content Plan & Revenue Consulting',
    description:
      'Everything in Build, plus the system that turns the new brand into income: a content and format system for the founder’s own presence, and hands-on consulting to open additional income sources through social. Scoped as a three-month engagement by default.',
    priceAmount: 3_500_000,
    currency: 'USD',
    billingPeriod: 'project',
    displayOrder: 3,
    features: [
      'Everything in Build',
      'Content and format system for the founder’s own presence',
      'Revenue consulting: sponsorships, products, speaking, cohort or community offers',
      'Three-month engagement by default',
      'From $35,000 project fee · From PKR 1,800,000 for clients in Pakistan',
      'Extension retainer from $5,000 a month · From PKR 250,000 a month',
      DISCOVERY,
    ],
  },
  {
    slug: 'creator-starter',
    name: 'Creator · Starter — Growth Consultation',
    description:
      'Consulting only, no ongoing management. A channel and content audit, one to two strategy sessions, and a written growth plan covering format, cadence and monetization readiness.',
    priceAmount: 250_000,
    currency: 'USD',
    billingPeriod: 'one-off',
    displayOrder: 4,
    features: [
      'Channel and content audit',
      'One to two strategy sessions',
      'Written growth plan: format, cadence, monetization readiness',
      'From $2,500 · From PKR 120,000 for clients in Pakistan',
      DISCOVERY,
    ],
  },
  {
    slug: 'creator-operator',
    name: 'Creator · Operator — Growth Operator Service',
    description:
      'What a growth operator normally does for a creator, run as an ongoing retainer rather than a one-time project. Minimum three-month term.',
    priceAmount: 800_000,
    currency: 'USD',
    billingPeriod: 'month',
    displayOrder: 5,
    features: [
      'Ongoing content strategy',
      'Scripting and packaging direction',
      'Thumbnail and title guidance',
      'Posting cadence management',
      'Monthly performance reporting',
      'Minimum three-month term',
      'From $8,000 a month · From PKR 400,000 a month for clients in Pakistan',
      DISCOVERY,
    ],
  },
  {
    slug: 'creator-represented',
    name: 'Creator · Represented — Growth + PR, Sponsorships & Events',
    description:
      'Everything in Operator, plus Phistreams actively sourcing and negotiating income on the creator’s behalf. A monthly retainer plus a commission on the deals we secure.',
    priceAmount: 1_200_000,
    currency: 'USD',
    billingPeriod: 'month',
    displayOrder: 6,
    features: [
      'Everything in Operator',
      'Sponsorship and brand-deal sourcing and negotiation',
      'PR placements',
      'Event and speaking opportunities',
      'From $12,000 a month · From PKR 700,000 a month for clients in Pakistan',
      'Plus 15–20% commission on secured deals',
      DISCOVERY,
    ],
  },
];

/** Fixed ids of the demo tiers in demo-data.ts (101, 102, 103). */
const DEMO_TIER_IDS = [101, 102, 103].map(demoId);

export interface PublishTiersResult {
  readonly upserted: number;
  /** Demo tiers hidden from /apply and the public API. */
  readonly demoDeactivated: number;
}

/**
 * Makes the real tiers live and hides the demo ones, in one transaction.
 * Idempotent: rows are matched by slug and updated in place, so editing the
 * copy above and re-running is the way to change a tier.
 *
 * Demo tiers are deactivated, not deleted: demo applications (and any real
 * application that picked a demo tier while it was shown) reference them.
 * `unseedDemoAdminData` removes what it safely can afterwards.
 */
export async function publishServiceTiers(db: Db): Promise<PublishTiersResult> {
  return db.transaction(async (tx) => {
    for (const tier of realServiceTiers) {
      const values = { ...tier, features: [...tier.features], isActive: true };
      await tx
        .insert(serviceTiers)
        .values(values)
        .onConflictDoUpdate({
          target: serviceTiers.slug,
          set: {
            name: values.name,
            description: values.description,
            priceAmount: values.priceAmount,
            currency: values.currency,
            billingPeriod: values.billingPeriod,
            displayOrder: values.displayOrder,
            features: values.features,
            isActive: true,
          },
        });
    }

    const hidden = await tx
      .update(serviceTiers)
      .set({ isActive: false })
      .where(and(inArray(serviceTiers.id, DEMO_TIER_IDS), eq(serviceTiers.isActive, true)))
      .returning({ id: serviceTiers.id });

    return { upserted: realServiceTiers.length, demoDeactivated: hidden.length };
  });
}
