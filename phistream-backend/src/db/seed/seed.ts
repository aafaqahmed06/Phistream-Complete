import { inArray } from 'drizzle-orm';

import type { Db } from '../client.js';
import {
  applicationAnswers,
  applicationEvents,
  applicationForms,
  applications,
  faqs,
  leads,
  serviceTiers,
  siteConfig,
  staffUsers,
  testimonials,
} from '../schema/index.js';
import {
  demoApplicationAnswers,
  demoApplicationEvents,
  demoApplicationForms,
  demoApplications,
  demoFaqs,
  demoId,
  demoLeads,
  demoServiceTiers,
  demoSiteConfig,
  demoStaffUsers,
  demoTestimonials,
} from './demo-data.js';

export interface SeedResult {
  /** Rows inserted per table (0 on re-runs: existing rows are left untouched). */
  readonly inserted: Readonly<Record<string, number>>;
}

/**
 * Inserts demo data in one transaction, in foreign-key order. Idempotent:
 * rows that already exist (by id or unique key) are skipped, never updated,
 * so local edits survive a re-seed.
 */
export async function seedDemoData(db: Db): Promise<SeedResult> {
  return db.transaction(async (tx) => {
    const count = async (rows: Promise<unknown[]>) => (await rows).length;

    // Order matters: referenced rows first.
    const inserted = {
      service_tiers: await count(
        tx.insert(serviceTiers).values(demoServiceTiers).onConflictDoNothing().returning(),
      ),
      faqs: await count(tx.insert(faqs).values(demoFaqs).onConflictDoNothing().returning()),
      testimonials: await count(
        tx.insert(testimonials).values(demoTestimonials).onConflictDoNothing().returning(),
      ),
      site_config: await count(
        tx.insert(siteConfig).values(demoSiteConfig).onConflictDoNothing().returning(),
      ),
      staff_users: await count(
        tx.insert(staffUsers).values(demoStaffUsers).onConflictDoNothing().returning(),
      ),
      leads: await count(tx.insert(leads).values(demoLeads).onConflictDoNothing().returning()),
      application_forms: await count(
        tx.insert(applicationForms).values(demoApplicationForms).onConflictDoNothing().returning(),
      ),
      applications: await count(
        tx.insert(applications).values(demoApplications).onConflictDoNothing().returning(),
      ),
      application_answers: await count(
        tx
          .insert(applicationAnswers)
          .values(demoApplicationAnswers)
          .onConflictDoNothing()
          .returning(),
      ),
      application_events: await count(
        tx
          .insert(applicationEvents)
          .values(demoApplicationEvents)
          .onConflictDoNothing()
          .returning(),
      ),
    };

    return { inserted };
  });
}

export interface UnseedResult {
  /** Rows deleted per table. */
  readonly deleted: Readonly<Record<string, number>>;
}

/**
 * Removes the demo rows that the public site renders: testimonials, FAQs, and
 * the contact email, phone and social links. Deletes by the fixed demo ids
 * only, so real content can never be hit, and real replacements can then be
 * entered without the placeholders shadowing them.
 *
 * Service tiers, the application form, applications and staff are left alone:
 * applications reference them, and /apply needs a published form.
 */
export async function unseedDemoContent(db: Db): Promise<UnseedResult> {
  // Matches the fixed ids in demo-data.ts. site_config: contact.email (403),
  // contact.phone (405), social.links (406).
  const testimonialIds = [301, 302, 303].map(demoId);
  const faqIds = [201, 202, 203].map(demoId);
  const configIds = [403, 405, 406].map(demoId);

  return db.transaction(async (tx) => ({
    deleted: {
      testimonials: (
        await tx.delete(testimonials).where(inArray(testimonials.id, testimonialIds)).returning()
      ).length,
      faqs: (await tx.delete(faqs).where(inArray(faqs.id, faqIds)).returning()).length,
      site_config: (
        await tx.delete(siteConfig).where(inArray(siteConfig.id, configIds)).returning()
      ).length,
    },
  }));
}
