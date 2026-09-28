import { randomUUID } from 'node:crypto';

import type { LeadStatus } from '../../src/db/schema/enums.js';
import type {
  LeadsRepository,
  LeadsTransaction,
  NewContactSubmission,
} from '../../src/modules/leads/leads.repository.js';
import type { NotificationEventInput } from '../../src/modules/notifications/notification-outbox.js';

export interface FakeLead {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  companyName: string | null;
  source: string | null;
  campaign: string | null;
  status: LeadStatus;
  createdAt: Date;
}

export interface FakeSubmission extends NewContactSubmission {
  id: string;
  createdAt: Date;
}

/**
 * In-memory LeadsRepository mirroring the real semantics (latest lead by
 * email, fill-if-null, activity across all leads with the email). The SQL
 * itself is covered by tests/db/contact.test.ts.
 */
export function createFakeLeadsRepository(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const leads: FakeLead[] = [];
  const submissions: FakeSubmission[] = [];
  const events: NotificationEventInput[] = [];
  let lock: Promise<unknown> = Promise.resolve();

  const leadsFor = (email: string) => leads.filter((lead) => lead.email === email);

  const tx: LeadsTransaction = {
    findLatestLeadByEmail: (email) => {
      const latest = leadsFor(email).at(-1);
      return Promise.resolve(latest && { ...latest });
    },
    createLead: (lead) => {
      const id = randomUUID();
      leads.push({ ...lead, id, status: 'NEW', createdAt: now() });
      return Promise.resolve(id);
    },
    fillMissingLeadFields: (leadId, fields) => {
      const lead = leads.find((candidate) => candidate.id === leadId);
      if (!lead) throw new Error('unknown lead');
      for (const [key, value] of Object.entries(fields) as [keyof typeof fields, string][]) {
        lead[key] ??= value;
      }
      return Promise.resolve();
    },
    getSubmissionActivity: (email, query) => {
      const ids = new Set(leadsFor(email).map((lead) => lead.id));
      const mine = submissions.filter((submission) => ids.has(submission.leadId));
      return Promise.resolve({
        recentCount: mine.filter((s) => s.createdAt >= query.countSince).length,
        hasIdenticalMessage: mine.some(
          (s) => s.createdAt >= query.duplicateSince && s.message === query.message,
        ),
      });
    },
    insertContactSubmission: (submission) => {
      const id = randomUUID();
      submissions.push({ ...submission, id, createdAt: now() });
      return Promise.resolve(id);
    },
    enqueueNotificationEvent: (event) => {
      events.push(event);
      return Promise.resolve();
    },
  };

  const repository: LeadsRepository = {
    withEmailLock(_email, work) {
      // One global queue is enough to serialize work in tests.
      const run = lock.then(() => work(tx));
      lock = run.catch(() => undefined);
      return run;
    },
  };

  return { repository, leads, submissions, events };
}
