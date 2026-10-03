import { and, eq } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { MeetingStatus } from '../../db/schema/enums.js';
import {
  applications,
  contactSubmissions,
  leads,
  meetings,
  schedulingWebhookEvents,
  serviceTiers,
  staffUsers,
} from '../../db/schema/index.js';

/**
 * Loads the data each notification needs, by the outbox subject id. Selects
 * only the fields templates use. Resolves undefined when the subject no
 * longer exists (e.g. deleted under a retention request).
 */

export interface ContactContext {
  name: string;
  email: string;
  phone: string | null;
  companyName: string | null;
  message: string;
  source: string | null;
  campaign: string | null;
  receivedAt: Date;
}

export interface ApplicationContext {
  id: string;
  reference: string;
  applicantName: string;
  applicantEmail: string;
  serviceTierName: string | null;
  source: string | null;
  submittedAt: Date;
}

export interface MeetingContext {
  applicationId: string;
  reference: string;
  applicantName: string;
  applicantEmail: string;
  startsAt: Date;
  endsAt: Date;
  meetingUrl: string | null;
  status: MeetingStatus;
}

export interface WebhookEventContext {
  provider: string;
  eventType: string;
  outcome: string | null;
  bookingId: string | null;
  applicationId: string | null;
  reference: string | null;
  receivedAt: Date;
}

export interface NotificationContext {
  contactSubmission(id: string): Promise<ContactContext | undefined>;
  application(id: string): Promise<ApplicationContext | undefined>;
  meeting(id: string): Promise<MeetingContext | undefined>;
  schedulingWebhookEvent(id: string): Promise<WebhookEventContext | undefined>;
  /** Configured recipients, or every active ADMIN staff user. */
  staffRecipients(): Promise<string[]>;
}

export function createNotificationContext(
  db: Db,
  options: { staffRecipients: readonly string[] | undefined },
): NotificationContext {
  return {
    async contactSubmission(id) {
      const [row] = await db
        .select({
          name: contactSubmissions.fullName,
          email: leads.email,
          phone: contactSubmissions.phone,
          companyName: contactSubmissions.companyName,
          message: contactSubmissions.message,
          source: contactSubmissions.source,
          campaign: contactSubmissions.campaign,
          receivedAt: contactSubmissions.createdAt,
        })
        .from(contactSubmissions)
        .innerJoin(leads, eq(leads.id, contactSubmissions.leadId))
        .where(eq(contactSubmissions.id, id))
        .limit(1);
      return row;
    },

    async application(id) {
      const [row] = await db
        .select({
          id: applications.id,
          reference: applications.reference,
          applicantName: leads.fullName,
          applicantEmail: leads.email,
          serviceTierName: serviceTiers.name,
          source: leads.source,
          submittedAt: applications.submittedAt,
        })
        .from(applications)
        .innerJoin(leads, eq(leads.id, applications.leadId))
        .leftJoin(serviceTiers, eq(serviceTiers.id, applications.serviceTierId))
        .where(eq(applications.id, id))
        .limit(1);
      return row;
    },

    async meeting(id) {
      const [row] = await db
        .select({
          applicationId: applications.id,
          reference: applications.reference,
          applicantName: leads.fullName,
          applicantEmail: leads.email,
          startsAt: meetings.startsAt,
          endsAt: meetings.endsAt,
          meetingUrl: meetings.meetingUrl,
          status: meetings.status,
        })
        .from(meetings)
        .innerJoin(applications, eq(applications.id, meetings.applicationId))
        .innerJoin(leads, eq(leads.id, applications.leadId))
        .where(eq(meetings.id, id))
        .limit(1);
      return row;
    },

    async schedulingWebhookEvent(id) {
      const [row] = await db
        .select({
          provider: schedulingWebhookEvents.provider,
          eventType: schedulingWebhookEvents.eventType,
          outcome: schedulingWebhookEvents.outcome,
          bookingId: schedulingWebhookEvents.bookingId,
          applicationId: schedulingWebhookEvents.applicationId,
          reference: applications.reference,
          receivedAt: schedulingWebhookEvents.receivedAt,
        })
        .from(schedulingWebhookEvents)
        .leftJoin(applications, eq(applications.id, schedulingWebhookEvents.applicationId))
        .where(eq(schedulingWebhookEvents.id, id))
        .limit(1);
      return row;
    },

    async staffRecipients() {
      if (options.staffRecipients && options.staffRecipients.length > 0) {
        return [...options.staffRecipients];
      }
      const rows = await db
        .select({ email: staffUsers.email })
        .from(staffUsers)
        .where(and(eq(staffUsers.role, 'ADMIN'), eq(staffUsers.isActive, true)));
      return [...new Set(rows.map((row) => row.email.toLowerCase()))];
    },
  };
}
