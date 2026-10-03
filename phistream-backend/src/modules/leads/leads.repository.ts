import { and, count, desc, eq, gte, sql, type SQL } from 'drizzle-orm';

import type { Db, DbTransaction } from '../../db/client.js';
import type { LeadStatus } from '../../db/schema/enums.js';
import { contactSubmissions, leads } from '../../db/schema/index.js';
import {
  enqueueNotificationEvent,
  type NotificationEventInput,
} from '../notifications/notification-outbox.js';

/**
 * Data access for leads and contact submissions. PRIVATE data: nothing here
 * may be returned from a public endpoint.
 *
 * Emails passed in must already be normalized (trimmed, lowercase); lookups
 * compare against `lower(email)` so they use `leads_email_lower_idx`.
 */

export interface LeadRecord {
  readonly id: string;
  readonly status: LeadStatus;
  readonly phone: string | null;
  readonly companyName: string | null;
  readonly source: string | null;
  readonly campaign: string | null;
}

export interface NewLead {
  readonly email: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly companyName: string | null;
  readonly source: string | null;
  readonly campaign: string | null;
}

/** Only these lead fields may be filled in from a public submission. */
export const FILLABLE_LEAD_FIELDS = ['phone', 'companyName', 'source', 'campaign'] as const;
export type FillableLeadFields = Partial<Pick<LeadRecord, (typeof FILLABLE_LEAD_FIELDS)[number]>>;

export interface NewContactSubmission {
  readonly leadId: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly companyName: string | null;
  readonly message: string;
  readonly source: string | null;
  readonly campaign: string | null;
}

export interface SubmissionActivityQuery {
  /** Count submissions created at or after this instant. */
  readonly countSince: Date;
  /** Look for an identical message created at or after this instant. */
  readonly duplicateSince: Date;
  readonly message: string;
}

export interface SubmissionActivity {
  readonly recentCount: number;
  readonly hasIdenticalMessage: boolean;
}

/** Lead lookups/writes used by lead resolution (see lead-resolution.ts). */
export interface LeadResolutionOperations {
  findLatestLeadByEmail(email: string): Promise<LeadRecord | undefined>;
  createLead(lead: NewLead): Promise<string>;
  /** Sets the given fields, but only where the stored value is still NULL. */
  fillMissingLeadFields(leadId: string, fields: FillableLeadFields): Promise<void>;
}

/** Operations available inside a per-email contact transaction. */
export interface LeadsTransaction extends LeadResolutionOperations {
  /** Contact submissions across every lead with this email. */
  getSubmissionActivity(email: string, query: SubmissionActivityQuery): Promise<SubmissionActivity>;
  insertContactSubmission(submission: NewContactSubmission): Promise<string>;
  enqueueNotificationEvent(event: NotificationEventInput): Promise<void>;
}

export interface LeadsRepository {
  /**
   * Runs `work` in one transaction while holding a lock on the normalized
   * email, so concurrent submissions for the same person are applied one after
   * another (no duplicate leads from double-clicks or parallel requests).
   * Different emails do not block each other.
   */
  withEmailLock<T>(email: string, work: (tx: LeadsTransaction) => Promise<T>): Promise<T>;
}

/** Namespaces the advisory-lock key so other lock users cannot collide by accident. */
const EMAIL_LOCK_NAMESPACE = 'phistream:lead-email:';

/**
 * Runs `work` in one transaction holding an advisory lock on the normalized
 * email. Every public flow that resolves a lead (contact, applications) uses
 * this, so they serialize against each other for the same person.
 */
export function runWithEmailLock<T>(
  db: Db,
  email: string,
  work: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Transaction-scoped: released automatically on commit/rollback, so it is
    // safe with the Supabase transaction pooler.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${EMAIL_LOCK_NAMESPACE + email}, 0))`,
    );
    return work(tx);
  });
}

/** Lead resolution operations bound to a transaction (reused by other modules). */
export function leadResolutionOperations(tx: DbTransaction): LeadResolutionOperations {
  return {
    async findLatestLeadByEmail(email) {
      const rows = await tx
        .select({
          id: leads.id,
          status: leads.status,
          phone: leads.phone,
          companyName: leads.companyName,
          source: leads.source,
          campaign: leads.campaign,
        })
        .from(leads)
        .where(eq(sql`lower(${leads.email})`, email))
        .orderBy(desc(leads.createdAt), desc(leads.id))
        .limit(1);
      return rows[0];
    },

    async createLead(lead) {
      const [row] = await tx.insert(leads).values(lead).returning({ id: leads.id });
      if (!row) throw new Error('lead insert returned no row');
      return row.id;
    },

    async fillMissingLeadFields(leadId, fields) {
      // coalesce() keeps the stored value even if it was set after the read.
      const set: Partial<Record<keyof FillableLeadFields, SQL>> = {};
      for (const key of FILLABLE_LEAD_FIELDS) {
        const value = fields[key];
        if (value !== null && value !== undefined) {
          set[key] = sql`coalesce(${leads[key]}, ${value})`;
        }
      }
      if (Object.keys(set).length === 0) return;
      await tx.update(leads).set(set).where(eq(leads.id, leadId));
    },
  };
}

function contactOperations(tx: DbTransaction): LeadsTransaction {
  return {
    ...leadResolutionOperations(tx),

    async getSubmissionActivity(email, query) {
      const since =
        query.countSince < query.duplicateSince ? query.countSince : query.duplicateSince;
      const [row] = await tx
        .select({
          recentCount: count(
            sql`case when ${contactSubmissions.createdAt} >= ${query.countSince} then 1 end`,
          ),
          identical: count(
            sql`case when ${contactSubmissions.createdAt} >= ${query.duplicateSince}
                      and ${contactSubmissions.message} = ${query.message} then 1 end`,
          ),
        })
        .from(contactSubmissions)
        .innerJoin(leads, eq(leads.id, contactSubmissions.leadId))
        .where(
          and(eq(sql`lower(${leads.email})`, email), gte(contactSubmissions.createdAt, since)),
        );
      return {
        recentCount: row?.recentCount ?? 0,
        hasIdenticalMessage: (row?.identical ?? 0) > 0,
      };
    },

    async insertContactSubmission(submission) {
      const [row] = await tx
        .insert(contactSubmissions)
        .values(submission)
        .returning({ id: contactSubmissions.id });
      if (!row) throw new Error('contact submission insert returned no row');
      return row.id;
    },

    enqueueNotificationEvent: (event) => enqueueNotificationEvent(tx, event),
  };
}

export function createLeadsRepository(db: Db): LeadsRepository {
  return {
    withEmailLock: (email, work) =>
      runWithEmailLock(db, email, (tx) => work(contactOperations(tx))),
  };
}
