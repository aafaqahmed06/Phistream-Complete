import { randomUUID } from 'node:crypto';

import type { ApplicationStatus, LeadStatus } from '../../src/db/schema/enums.js';
import type {
  AnswerValue,
  FormDefinition,
} from '../../src/modules/applications/application-form.js';
import type {
  ApplicationsRepository,
  NewAccessToken,
  NewApplicationEvent,
  SubmissionTransaction,
} from '../../src/modules/applications/applications.repository.js';
import type { NotificationEventInput } from '../../src/modules/notifications/notification-outbox.js';
import type { AuditLogEntry } from '../../src/modules/admin/audit-log.js';

export interface FakeNote {
  id: string;
  applicationId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface FakeApplication {
  id: string;
  reference: string;
  leadId: string;
  serviceTierId: string | null;
  formVersion: string;
  submissionFingerprint: string | null;
  status: ApplicationStatus;
  submittedAt: Date;
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  acceptedAt?: Date;
  rejectionReason?: string;
}

export interface FakeLeadRow {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  campaign: string | null;
  status: LeadStatus;
}

/** A small valid definition using every question type. */
export const TEST_FORM: FormDefinition = {
  title: 'Test form',
  questions: [
    { key: 'about', type: 'text', label: 'About', required: true, multiline: true, maxLength: 200 },
    {
      key: 'followers',
      type: 'number',
      label: 'Followers',
      required: false,
      integer: true,
      min: 0,
    },
    {
      key: 'platform',
      type: 'single_choice',
      label: 'Platform',
      required: true,
      options: [
        { value: 'instagram', label: 'Instagram' },
        { value: 'tiktok', label: 'TikTok' },
      ],
    },
    {
      key: 'goals',
      type: 'multiple_choice',
      label: 'Goals',
      required: false,
      options: [
        { value: 'growth', label: 'Growth' },
        { value: 'brand', label: 'Brand' },
        { value: 'sales', label: 'Sales' },
      ],
      maxSelections: 2,
    },
    { key: 'agree', type: 'boolean', label: 'Agree', required: true },
    { key: 'portfolio', type: 'url', label: 'Portfolio', required: false },
  ],
};

export const TEST_ANSWERS = { about: 'I make videos.', platform: 'instagram', agree: true };

/**
 * In-memory ApplicationsRepository with the real semantics (active form,
 * active tiers, per-email activity, token lookup rules, row-locked
 * transitions). The SQL itself is covered by tests/db/applications.test.ts.
 */
export function createFakeApplicationsRepository(
  options: {
    form?: { version: string; definition: unknown } | undefined;
    tiers?: Record<string, { id: string; isActive: boolean }>;
    now?: () => Date;
  } = {},
) {
  const now = options.now ?? (() => new Date());
  const state = {
    form: 'form' in options ? options.form : { version: 'v1', definition: TEST_FORM },
    tiers: options.tiers ?? {},
    leads: [] as FakeLeadRow[],
    applications: [] as FakeApplication[],
    answers: [] as { applicationId: string; questionKey: string; answer: AnswerValue }[],
    events: [] as NewApplicationEvent[],
    tokens: [] as (NewAccessToken & { revokedAt: Date | null })[],
    notifications: [] as NotificationEventInput[],
    /** Number of upcoming inserts to treat as reference collisions. */
    referenceCollisions: 0,
    /** Every reference the service tried to insert, in order. */
    attemptedReferences: [] as string[],
    notes: [] as FakeNote[],
    auditLogs: [] as AuditLogEntry[],
    /** Makes the next audit insert inside a lifecycle transaction throw. */
    failNextAuditInsert: false,
  };
  let lock: Promise<unknown> = Promise.resolve();
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const run = lock.then(work);
    lock = run.catch(() => undefined);
    return run;
  };

  const leadsFor = (email: string) => state.leads.filter((lead) => lead.email === email);

  const tx: SubmissionTransaction = {
    findLatestLeadByEmail: (email) => Promise.resolve(leadsFor(email).at(-1)),
    createLead: (lead) => {
      const id = randomUUID();
      state.leads.push({ ...lead, id, status: 'NEW' });
      return Promise.resolve(id);
    },
    fillMissingLeadFields: (leadId, fields) => {
      const lead = state.leads.find((candidate) => candidate.id === leadId);
      if (lead) {
        for (const [key, value] of Object.entries(fields) as [keyof typeof fields, string][]) {
          lead[key] ??= value;
        }
      }
      return Promise.resolve();
    },
    getApplicationActivity: (email, query) => {
      const leadIds = new Set(leadsFor(email).map((lead) => lead.id));
      return Promise.resolve({
        recentCount: state.applications.filter(
          (a) => leadIds.has(a.leadId) && a.createdAt >= query.countSince,
        ).length,
        hasDuplicate: state.applications.some(
          (a) =>
            a.submissionFingerprint === query.fingerprint && a.createdAt >= query.duplicateSince,
        ),
      });
    },
    insertApplication: (application) => {
      state.attemptedReferences.push(application.reference);
      if (
        state.referenceCollisions > 0 ||
        state.applications.some((a) => a.reference === application.reference)
      ) {
        state.referenceCollisions = Math.max(0, state.referenceCollisions - 1);
        return Promise.resolve(undefined);
      }
      const id = randomUUID();
      state.applications.push({
        ...application,
        id,
        status: 'NEW',
        submittedAt: now(),
        createdAt: now(),
      });
      return Promise.resolve(id);
    },
    insertAnswers: (applicationId, answers) => {
      for (const [questionKey, answer] of Object.entries(answers)) {
        state.answers.push({ applicationId, questionKey, answer });
      }
      return Promise.resolve();
    },
    insertEvent: (event) => {
      state.events.push(event);
      return Promise.resolve();
    },
    insertAccessToken: (token) => {
      state.tokens.push({ ...token, revokedAt: null });
      return Promise.resolve();
    },
    enqueueNotificationEvent: (event) => {
      state.notifications.push(event);
      return Promise.resolve();
    },
  };

  const repository: ApplicationsRepository = {
    findActiveForm: () => Promise.resolve(state.form),
    findActiveServiceTierId: (slug) => {
      const tier = state.tiers[slug];
      return Promise.resolve(tier?.isActive ? tier.id : undefined);
    },
    withEmailLock: (_email, work) => serialize(() => work(tx)),
    // STATUS is the only token purpose so far; the real query also filters on it.
    findStatusByAccessToken: ({ applicationId, tokenHash, now: at }) => {
      const token = state.tokens.find(
        (t) =>
          t.tokenHash === tokenHash &&
          t.applicationId === applicationId &&
          t.revokedAt === null &&
          t.expiresAt > at,
      );
      const application = token && state.applications.find((a) => a.id === applicationId);
      return Promise.resolve(
        application && {
          reference: application.reference,
          status: application.status,
          submittedAt: application.submittedAt,
        },
      );
    },
    // Atomic like the real transaction: writes are staged and applied only if
    // `work` resolves.
    withApplicationLock: (applicationId, work) =>
      serialize(async () => {
        const application = state.applications.find((a) => a.id === applicationId);
        if (!application) return undefined;
        const draft = { ...application };
        const staged = {
          events: [] as NewApplicationEvent[],
          notes: [] as FakeNote[],
          audit: [] as AuditLogEntry[],
          notifications: [] as NotificationEventInput[],
        };
        const result = await work({
          get application() {
            return { id: draft.id, status: draft.status };
          },
          updateStatus: (update) => {
            Object.assign(draft, update);
            return Promise.resolve();
          },
          insertEvent: (event) => {
            staged.events.push(event);
            return Promise.resolve();
          },
          insertNote: (note) => {
            const created = { id: randomUUID(), applicationId, createdAt: now(), ...note };
            staged.notes.push(created);
            return Promise.resolve({ id: created.id, createdAt: created.createdAt });
          },
          insertAuditLog: (entry) => {
            if (state.failNextAuditInsert) {
              state.failNextAuditInsert = false;
              return Promise.reject(new Error('audit insert failed'));
            }
            staged.audit.push(entry);
            return Promise.resolve();
          },
          enqueueNotificationEvent: (event) => {
            staged.notifications.push(event);
            return Promise.resolve();
          },
        });
        Object.assign(application, draft);
        state.events.push(...staged.events);
        state.notes.push(...staged.notes);
        state.auditLogs.push(...staged.audit);
        state.notifications.push(...staged.notifications);
        return result;
      }),
  };

  return { repository, state };
}
