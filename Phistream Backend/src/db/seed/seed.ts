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
