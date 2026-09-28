import { and, count, eq, gt, gte, isNull, sql } from 'drizzle-orm';

import type { Db, DbTransaction } from '../../db/client.js';
import type {
  ActorType,
  ApplicationAccessTokenPurpose,
  ApplicationStatus,
} from '../../db/schema/enums.js';
import {
  applicationAccessTokens,
  applicationAnswers,
  applicationEvents,
  applicationForms,
  applicationNotes,
  applications,
  leads,
  serviceTiers,
} from '../../db/schema/index.js';
import {
  leadResolutionOperations,
  runWithEmailLock,
  type LeadResolutionOperations,
} from '../leads/leads.repository.js';
import {
  enqueueNotificationEvent,
  type NotificationEventInput,
} from '../notifications/notification-outbox.js';
import { insertAuditLog, type AuditLogEntry } from '../admin/audit-log.js';
import type { AnswerValue } from './application-form.js';
import type { ApplicationEventType } from './application-status.js';

/**
 * Data access for applications. PRIVATE data: the only things that leave this
 * module publicly are the ACTIVE form definition and the coarse public status
 * (mapped by the service).
 */

export interface StoredForm {
  readonly version: string;
  /** Raw JSONB; validated by the service before use. */
  readonly definition: unknown;
}

export interface NewApplication {
  readonly reference: string;
  readonly leadId: string;
  readonly serviceTierId: string | null;
  readonly formVersion: string;
  readonly submissionFingerprint: string;
  // submitted_at is set by the database (now()), like every event timestamp
  // that reports compare against the database clock.
  readonly source: string | null;
  readonly campaign: string | null;
}

export interface NewApplicationEvent {
  readonly applicationId: string;
  readonly eventType: ApplicationEventType;
  readonly actorType: ActorType;
  readonly actorId: string | null;
  readonly metadata: Record<string, unknown> | null;
}

export interface NewAccessToken {
  readonly applicationId: string;
  readonly purpose: ApplicationAccessTokenPurpose;
  readonly tokenHash: string;
  readonly expiresAt: Date;
}

export interface ApplicationActivityQuery {
  /** Count this email's applications created at or after this instant. */
  readonly countSince: Date;
  /** Look for the same fingerprint created at or after this instant. */
  readonly duplicateSince: Date;
  readonly fingerprint: string;
}

export interface ApplicationActivity {
  readonly recentCount: number;
  readonly hasDuplicate: boolean;
}

/** Operations inside the per-email submission transaction. */
export interface SubmissionTransaction extends LeadResolutionOperations {
  getApplicationActivity(
    email: string,
    query: ApplicationActivityQuery,
  ): Promise<ApplicationActivity>;
  /** Resolves undefined if the reference is already taken (caller retries). */
  insertApplication(application: NewApplication): Promise<string | undefined>;
  insertAnswers(
    applicationId: string,
    answers: Readonly<Record<string, AnswerValue>>,
  ): Promise<void>;
  insertEvent(event: NewApplicationEvent): Promise<void>;
  insertAccessToken(token: NewAccessToken): Promise<void>;
  enqueueNotificationEvent(event: NotificationEventInput): Promise<void>;
}

export interface ApplicationStatusRow {
  readonly reference: string;
  readonly status: ApplicationStatus;
  readonly submittedAt: Date;
}

export interface LockedApplication {
  readonly id: string;
  readonly status: ApplicationStatus;
}

export interface ApplicationStatusUpdate {
  readonly status: ApplicationStatus;
  readonly reviewedAt?: Date;
  readonly reviewedBy?: string;
  readonly acceptedAt?: Date;
  readonly rejectionReason?: string;
}

/**
 * Operations inside a transaction holding a row lock on one application.
 * Everything written through it commits or rolls back together.
 */
export interface LifecycleTransaction {
  /** The locked application; `status` reflects updates made in this transaction. */
  readonly application: LockedApplication;
  updateStatus(update: ApplicationStatusUpdate): Promise<void>;
  insertEvent(event: NewApplicationEvent): Promise<void>;
  insertNote(note: { authorId: string; body: string }): Promise<{ id: string; createdAt: Date }>;
  insertAuditLog(entry: AuditLogEntry): Promise<void>;
  enqueueNotificationEvent(event: NotificationEventInput): Promise<void>;
}

export interface ApplicationsRepository {
  findActiveForm(): Promise<StoredForm | undefined>;
  findActiveServiceTierId(slug: string): Promise<string | undefined>;
  /** Per-email serialized transaction (shared lock with the contact flow). */
  withEmailLock<T>(email: string, work: (tx: SubmissionTransaction) => Promise<T>): Promise<T>;
  /**
   * The application's status, only if `tokenHash` is a live (unexpired,
   * unrevoked) token of `purpose` for exactly this application.
   */
  findStatusByAccessToken(input: {
    applicationId: string;
    tokenHash: string;
    purpose: ApplicationAccessTokenPurpose;
    now: Date;
  }): Promise<ApplicationStatusRow | undefined>;
  /**
   * Runs `work` in a transaction holding `SELECT ... FOR UPDATE` on the
   * application, so concurrent transitions are applied one at a time and each
   * sees the latest status. Resolves undefined if the application is unknown.
   */
  withApplicationLock<T>(
    applicationId: string,
    work: (tx: LifecycleTransaction) => Promise<T>,
  ): Promise<T | undefined>;
}

function insertEvent(tx: DbTransaction, event: NewApplicationEvent): Promise<unknown> {
  // clock_timestamp(): events written in one transaction keep their order
  // (now() would give them all the transaction start time).
  return tx.insert(applicationEvents).values({ ...event, createdAt: sql`clock_timestamp()` });
}

function submissionOperations(tx: DbTransaction): SubmissionTransaction {
  return {
    ...leadResolutionOperations(tx),

    async getApplicationActivity(email, query) {
      const [recent] = await tx
        .select({ n: count() })
        .from(applications)
        .innerJoin(leads, eq(leads.id, applications.leadId))
        .where(
          and(eq(sql`lower(${leads.email})`, email), gte(applications.createdAt, query.countSince)),
        );
      const duplicate = await tx
        .select({ id: applications.id })
        .from(applications)
        .where(
          and(
            eq(applications.submissionFingerprint, query.fingerprint),
            gte(applications.createdAt, query.duplicateSince),
          ),
        )
        .limit(1);
      return { recentCount: recent?.n ?? 0, hasDuplicate: duplicate.length > 0 };
    },

    async insertApplication(application) {
      const rows = await tx
        .insert(applications)
        .values(application)
        .onConflictDoNothing({ target: applications.reference })
        .returning({ id: applications.id });
      return rows[0]?.id;
    },

    async insertAnswers(applicationId, answers) {
      const rows = Object.entries(answers).map(([questionKey, answer]) => ({
        applicationId,
        questionKey,
        answer,
      }));
      if (rows.length > 0) await tx.insert(applicationAnswers).values(rows);
    },

    async insertEvent(event) {
      await insertEvent(tx, event);
    },

    async insertAccessToken(token) {
      await tx.insert(applicationAccessTokens).values(token);
    },

    enqueueNotificationEvent: (event) => enqueueNotificationEvent(tx, event),
  };
}

export function createApplicationsRepository(db: Db): ApplicationsRepository {
  return {
    async findActiveForm() {
      const rows = await db
        .select({ version: applicationForms.version, definition: applicationForms.definition })
        .from(applicationForms)
        .where(eq(applicationForms.status, 'ACTIVE'))
        .limit(1);
      return rows[0];
    },

    async findActiveServiceTierId(slug) {
      const rows = await db
        .select({ id: serviceTiers.id })
        .from(serviceTiers)
        .where(and(eq(serviceTiers.slug, slug), eq(serviceTiers.isActive, true)))
        .limit(1);
      return rows[0]?.id;
    },

    withEmailLock: (email, work) =>
      runWithEmailLock(db, email, (tx) => work(submissionOperations(tx))),

    async findStatusByAccessToken({ applicationId, tokenHash, purpose, now }) {
      // One query for every failure mode (unknown application, wrong token,
      // another application's token, expired, revoked), so they are
      // indistinguishable to the caller.
      const rows = await db
        .select({
          reference: applications.reference,
          status: applications.status,
          submittedAt: applications.submittedAt,
        })
        .from(applicationAccessTokens)
        .innerJoin(applications, eq(applications.id, applicationAccessTokens.applicationId))
        .where(
          and(
            eq(applicationAccessTokens.tokenHash, tokenHash),
            eq(applicationAccessTokens.applicationId, applicationId),
            eq(applicationAccessTokens.purpose, purpose),
            isNull(applicationAccessTokens.revokedAt),
            gt(applicationAccessTokens.expiresAt, now),
          ),
        )
        .limit(1);
      return rows[0];
    },

    async withApplicationLock(applicationId, work) {
      return db.transaction(async (tx) => {
        const locked = await lockApplication(tx, applicationId);
        return locked ? work(locked) : undefined;
      });
    },
  };
}

/**
 * Takes `SELECT ... FOR UPDATE` on the application inside an existing
 * transaction and returns the lifecycle operations bound to it. Other modules
 * (scheduling) use this to combine their own writes with state transitions in
 * one transaction. Resolves undefined if the application does not exist.
 */
export async function lockApplication(
  tx: DbTransaction,
  applicationId: string,
): Promise<LifecycleTransaction | undefined> {
  const [application] = await tx
    .select({ id: applications.id, status: applications.status })
    .from(applications)
    .where(eq(applications.id, applicationId))
    .for('update');
  if (!application) return undefined;

  let status = application.status;
  return {
    get application() {
      return { id: application.id, status };
    },
    async updateStatus(update) {
      await tx.update(applications).set(update).where(eq(applications.id, applicationId));
      status = update.status;
    },
    async insertEvent(event) {
      await insertEvent(tx, event);
    },
    async insertNote(note) {
      const [row] = await tx
        .insert(applicationNotes)
        .values({ applicationId, ...note })
        .returning({ id: applicationNotes.id, createdAt: applicationNotes.createdAt });
      if (!row) throw new Error('note insert returned no row');
      return row;
    },
    insertAuditLog: (entry) => insertAuditLog(tx, entry),
    enqueueNotificationEvent: (event) => enqueueNotificationEvent(tx, event),
  };
}
