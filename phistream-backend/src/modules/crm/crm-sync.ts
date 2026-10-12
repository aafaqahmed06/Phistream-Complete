import { eq } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import {
  applicationAnswers,
  applicationEvents,
  applications,
  leads,
  serviceTiers,
} from '../../db/schema/index.js';
import type { CrmProvider } from '../../providers/crm/crm-provider.js';
import type { NotificationContext } from '../notifications/notification-context.js';

/**
 * Turns CRM outbox events into Attio upserts. The event only names its subject;
 * everything synced is read fresh here, so a retried or late event always
 * pushes the *current* state (e.g. the deal's current stage), never a stale one.
 *
 * Privacy: sends the applicant's contact details and their own form answers.
 * Never staff notes, the rejection reason, or access tokens.
 */

export interface CrmSync {
  /** Resolves with a skip reason when there is nothing to sync, else undefined. */
  handle(event: { eventType: string; subjectId: string }): Promise<string | undefined>;
}

const label = (key: string) => key.replaceAll('_', ' ');

function show(value: unknown): string {
  if (Array.isArray(value)) return value.map(show).join(', ');
  return typeof value === 'string' ? value : JSON.stringify(value);
}

const lines = (entries: readonly (readonly [string, string | null | undefined])[]) =>
  entries
    .filter((entry): entry is readonly [string, string] => Boolean(entry[1]))
    .map(([name, value]) => `${name}: ${value}`)
    .join('\n');

export function createCrmSync(deps: {
  db: Db;
  provider: CrmProvider;
  context: Pick<NotificationContext, 'contactSubmission'>;
}): CrmSync {
  const { db, provider, context } = deps;

  async function contact(submissionId: string) {
    const c = await context.contactSubmission(submissionId);
    if (!c) return 'subject_missing';
    await provider.syncContact({
      person: { email: c.email, name: c.name, phone: c.phone },
      note: {
        title: 'Website contact message',
        content: `${c.message}\n\n${lines([
          ['Channel or company', c.companyName],
          ['Source', c.source],
          ['Campaign', c.campaign],
        ])}`.trim(),
      },
    });
    return undefined;
  }

  async function application(applicationEventId: string) {
    const [row] = await db
      .select({
        eventType: applicationEvents.eventType,
        applicationId: applications.id,
        reference: applications.reference,
        status: applications.status,
        name: leads.fullName,
        email: leads.email,
        phone: leads.phone,
        companyName: leads.companyName,
        source: leads.source,
        campaign: leads.campaign,
        tier: serviceTiers.name,
      })
      .from(applicationEvents)
      .innerJoin(applications, eq(applications.id, applicationEvents.applicationId))
      .innerJoin(leads, eq(leads.id, applications.leadId))
      .leftJoin(serviceTiers, eq(serviceTiers.id, applications.serviceTierId))
      .where(eq(applicationEvents.id, applicationEventId))
      .limit(1);
    if (!row) return 'subject_missing';

    // The qualification answers are attached once, when the application arrives.
    let note: { title: string; content: string } | undefined;
    if (row.eventType === 'SUBMITTED') {
      const answers = await db
        .select({ key: applicationAnswers.questionKey, answer: applicationAnswers.answer })
        .from(applicationAnswers)
        .where(eq(applicationAnswers.applicationId, row.applicationId));
      note = {
        title: `Application ${row.reference}`,
        content: `${lines([
          ['Service tier', row.tier],
          ['Channel or company', row.companyName],
          ['Source', row.source],
          ['Campaign', row.campaign],
        ])}\n\n${lines(
          answers
            .sort((a, b) => a.key.localeCompare(b.key))
            .map((a) => [label(a.key), show(a.answer)]),
        )}`.trim(),
      };
    }

    await provider.syncApplication({
      person: { email: row.email, name: row.name, phone: row.phone },
      deal: {
        reference: row.reference,
        name: `${row.name} – ${row.reference}`,
        status: row.status,
      },
      ...(note ? { note } : {}),
    });
    return undefined;
  }

  return {
    handle: ({ eventType, subjectId }) =>
      eventType === 'CRM_CONTACT_SYNC' ? contact(subjectId) : application(subjectId),
  };
}
