import { and, eq, inArray, ne, sql } from 'drizzle-orm';

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
  DEMO_FORM_VERSION,
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

export class UnseedAdminError extends Error {}

export interface UnseedAdminResult {
  readonly deleted: Readonly<Record<string, number>>;
  /** Demo staff kept because audit entries, notes or reviews still point at them. */
  readonly staffDeactivatedInstead: number;
}

/**
 * Removes the demo rows that show in the /admin dashboard: demo applications
 * (DEMO-0001, DEMO-0002), the two demo leads, and the two demo staff users.
 *
 * Must run AFTER the real form and real tiers are live, so it refuses to run
 * until an ACTIVE non-demo form and at least one active non-demo tier exist.
 *
 * Everything is matched by the fixed demo ids, and deletes are guarded:
 * - a demo lead is only deleted when nothing but the demo applications hangs
 *   off it (deleting a lead cascades to all its applications);
 * - a demo staff user is only deleted when no review, note or audit entry
 *   references it (those foreign keys are RESTRICT); otherwise it is
 *   deactivated so it can never sign in.
 *
 * The demo form and demo tiers are left in place: real applicants may already
 * have applied against them while they were live, and they are hidden from the
 * public site (retired / inactive).
 */
export async function unseedDemoAdminData(db: Db): Promise<UnseedAdminResult> {
  const applicationIds = [701, 702].map(demoId);
  const leadIds = [601, 602].map(demoId);
  const staffIds = [501, 502].map(demoId);
  const demoTierIds = [101, 102, 103].map(demoId);

  return db.transaction(async (tx) => {
    const [realForm] = await tx
      .select({ version: applicationForms.version })
      .from(applicationForms)
      .where(
        and(eq(applicationForms.status, 'ACTIVE'), ne(applicationForms.version, DEMO_FORM_VERSION)),
      )
      .limit(1);
    if (!realForm) {
      throw new UnseedAdminError(
        'Refusing to remove demo admin data: no real application form is ACTIVE yet. ' +
          'Publish it first (npm run forms:publish).',
      );
    }
    const realTiers = await tx
      .select({ id: serviceTiers.id })
      .from(serviceTiers)
      .where(eq(serviceTiers.isActive, true));
    if (!realTiers.some((tier) => !demoTierIds.includes(tier.id))) {
      throw new UnseedAdminError(
        'Refusing to remove demo admin data: no real service tier is active yet. ' +
          'Publish them first (npm run content:tiers).',
      );
    }

    // Cascades to answers, notes, events, access tokens, sessions and meetings.
    const deletedApplications = await tx
      .delete(applications)
      .where(inArray(applications.id, applicationIds))
      .returning({ id: applications.id });

    const deletedLeads = await tx
      .delete(leads)
      .where(
        and(
          inArray(leads.id, leadIds),
          sql`not exists (select 1 from applications where applications.lead_id = ${leads.id})`,
          sql`not exists (select 1 from contact_submissions where contact_submissions.lead_id = ${leads.id})`,
        ),
      )
      .returning({ id: leads.id });

    const deletedStaff = await tx
      .delete(staffUsers)
      .where(
        and(
          inArray(staffUsers.id, staffIds),
          sql`not exists (select 1 from applications where applications.reviewed_by = ${staffUsers.id})`,
          sql`not exists (select 1 from application_notes where application_notes.author_id = ${staffUsers.id})`,
          sql`not exists (select 1 from audit_logs where audit_logs.actor_id = ${staffUsers.id})`,
        ),
      )
      .returning({ id: staffUsers.id });

    const deactivated = await tx
      .update(staffUsers)
      .set({ isActive: false })
      .where(and(inArray(staffUsers.id, staffIds), eq(staffUsers.isActive, true)))
      .returning({ id: staffUsers.id });

    return {
      deleted: {
        applications: deletedApplications.length,
        leads: deletedLeads.length,
        staff_users: deletedStaff.length,
      },
      staffDeactivatedInstead: deactivated.length,
    };
  });
}
