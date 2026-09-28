import { EmailSendError, type EmailProvider } from '../../providers/email/email-provider.js';
import { AppError } from '../../shared/errors/app-error.js';
import type { NotificationContext } from './notification-context.js';
import type { NotificationEventType } from './notification-outbox.js';
import type { ClaimedEvent, NotificationsRepository } from './notifications.repository.js';
import {
  applicantApplicationAccepted,
  applicantApplicationRejected,
  applicantMeeting,
  staffApplicationSubmitted,
  staffContactReceived,
  staffMeeting,
  staffSchedulingNeedsAttention,
  type MeetingChange,
  type RenderedEmail,
  type TemplateId,
} from './templates.js';

/**
 * Turns outbox events into emails (BUILD_PLAN Phase 7).
 *
 * Per claimed event:
 *   1. Plan the messages (template + recipient) from the event's subject.
 *   2. For each: ensure a delivery row (unique per event/template/recipient);
 *      skip it if already SENT; otherwise render and send, passing the
 *      delivery id as the provider idempotency key, then record SENT with the
 *      provider message id, or FAILED with a sanitized error code.
 *   3. All sent → event PROCESSED. Otherwise the event is retried with
 *      exponential backoff (already-sent deliveries are skipped next time),
 *      or dead-lettered (FAILED) after `maxAttempts` or a permanent error.
 *
 * Idempotency: deliveries are unique rows and providers deduplicate by
 * idempotency key, so a crash between "sent" and "recorded" does not produce
 * a second email. Rendering is lazy, so side effects such as issuing a
 * scheduling link only happen when a message is actually about to be sent.
 *
 * Observability: every failure leaves the reason on the event and delivery
 * rows (visible via GET /admin/notifications) and is logged with ids and
 * codes. Logs never contain recipients, subjects, or bodies.
 */

export interface DispatcherLogger {
  info(object: object, message: string): void;
  warn(object: object, message: string): void;
  error(object: object, message: string): void;
}

/** Minimal scheduling capability the accepted-applicant email needs. */
export interface SchedulingLinkIssuer {
  issueAccess(
    applicationId: string,
    actorId: string | null,
  ): Promise<{ link: string | null; expiresAt: Date }>;
}

export interface DispatcherOptions {
  readonly from: string;
  readonly replyTo: string | undefined;
  readonly adminDashboardUrl: string | undefined;
  readonly batchSize: number;
  readonly maxAttempts: number;
  readonly leaseMs?: number;
}

export interface DispatchSummary {
  readonly claimed: number;
  /** Claimed but handed back because of shutdown. */
  readonly released: number;
  readonly processed: number;
  readonly retried: number;
  readonly failed: number;
}

export interface NotificationDispatcher {
  /**
   * Claims and processes one batch. When `signal` aborts (shutdown), events
   * not yet started are released for another worker instead of being held
   * until their lease expires.
   */
  runOnce(options?: { signal?: AbortSignal }): Promise<DispatchSummary>;
}

interface PlannedMessage {
  readonly template: TemplateId;
  readonly to: string;
  readonly replyTo?: string | undefined;
  readonly render: () => Promise<RenderedEmail>;
}

type Plan =
  | { readonly kind: 'send'; readonly messages: PlannedMessage[] }
  /** Nothing to send, and that is fine (e.g. the subject was deleted). */
  | { readonly kind: 'skip'; readonly reason: string }
  /** Cannot send until something is fixed (e.g. no staff recipients). */
  | { readonly kind: 'blocked'; readonly reason: string };

const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 60 * 60 * 1000;

export function backoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1), MAX_BACKOFF_MS);
}

const MEETING_CHANGES: Partial<Record<NotificationEventType, MeetingChange>> = {
  MEETING_BOOKED: 'booked',
  MEETING_RESCHEDULED: 'rescheduled',
  MEETING_CANCELLED: 'cancelled',
};

export function createNotificationDispatcher(deps: {
  repository: NotificationsRepository;
  context: NotificationContext;
  provider: EmailProvider;
  scheduling: SchedulingLinkIssuer | undefined;
  options: DispatcherOptions;
  logger: DispatcherLogger;
}): NotificationDispatcher {
  const { repository, context, provider, scheduling, options, logger } = deps;
  const adminLink = (applicationId: string | null) =>
    options.adminDashboardUrl && applicationId
      ? `${options.adminDashboardUrl}/applications/${applicationId}`
      : null;

  async function staff(
    template: TemplateId,
    render: () => RenderedEmail,
    replyTo?: string,
  ): Promise<Plan> {
    const recipients = await context.staffRecipients();
    if (recipients.length === 0) return { kind: 'blocked', reason: 'no_staff_recipients' };
    return {
      kind: 'send',
      messages: recipients.map((to) => ({
        template,
        to,
        replyTo,
        render: () => Promise.resolve(render()),
      })),
    };
  }

  async function plan(event: ClaimedEvent): Promise<Plan> {
    const type = event.eventType as NotificationEventType;
    switch (type) {
      case 'CONTACT_RECEIVED': {
        const contact = await context.contactSubmission(event.subjectId);
        if (!contact) return { kind: 'skip', reason: 'subject_missing' };
        return staff('staff.contact_received', () => staffContactReceived(contact), contact.email);
      }

      case 'APPLICATION_SUBMITTED': {
        const application = await context.application(event.subjectId);
        if (!application) return { kind: 'skip', reason: 'subject_missing' };
        return staff('staff.application_submitted', () =>
          staffApplicationSubmitted({ ...application, adminUrl: adminLink(application.id) }),
        );
      }

      case 'APPLICATION_ACCEPTED': {
        const application = await context.application(event.subjectId);
        if (!application) return { kind: 'skip', reason: 'subject_missing' };
        return {
          kind: 'send',
          messages: [
            {
              template: 'applicant.application_accepted',
              to: application.applicantEmail,
              render: async () => {
                const access = await issueSchedulingLink(application.id);
                return applicantApplicationAccepted({
                  name: application.applicantName,
                  reference: application.reference,
                  schedulingLink: access?.link ?? null,
                  linkExpiresAt: access?.link ? access.expiresAt : null,
                });
              },
            },
          ],
        };
      }

      case 'APPLICATION_REJECTED': {
        const application = await context.application(event.subjectId);
        if (!application) return { kind: 'skip', reason: 'subject_missing' };
        return {
          kind: 'send',
          messages: [
            {
              template: 'applicant.application_rejected',
              to: application.applicantEmail,
              render: () =>
                Promise.resolve(
                  applicantApplicationRejected({
                    name: application.applicantName,
                    reference: application.reference,
                  }),
                ),
            },
          ],
        };
      }

      case 'MEETING_BOOKED':
      case 'MEETING_RESCHEDULED':
      case 'MEETING_CANCELLED': {
        const change = MEETING_CHANGES[type] ?? 'booked';
        const meeting = await context.meeting(event.subjectId);
        if (!meeting) return { kind: 'skip', reason: 'subject_missing' };
        const data = { ...meeting, change };
        const staffPlan = await staff(`staff.meeting_${change}`, () =>
          staffMeeting({ ...data, adminUrl: adminLink(meeting.applicationId) }),
        );
        const applicantMessage: PlannedMessage = {
          template: `applicant.meeting_${change}`,
          to: meeting.applicantEmail,
          render: () => Promise.resolve(applicantMeeting(data)),
        };
        // The applicant is told even if no staff recipient is configured.
        return {
          kind: 'send',
          messages: [applicantMessage, ...(staffPlan.kind === 'send' ? staffPlan.messages : [])],
        };
      }

      case 'SCHEDULING_BOOKING_NEEDS_ATTENTION': {
        const webhook = await context.schedulingWebhookEvent(event.subjectId);
        if (!webhook) return { kind: 'skip', reason: 'subject_missing' };
        return staff('staff.scheduling_needs_attention', () =>
          staffSchedulingNeedsAttention({
            outcome: webhook.outcome ?? 'UNKNOWN',
            provider: webhook.provider,
            providerEventType: webhook.eventType,
            bookingId: webhook.bookingId,
            reference: webhook.reference,
            receivedAt: webhook.receivedAt,
            adminUrl: adminLink(webhook.applicationId),
          }),
        );
      }

      default:
        return { kind: 'blocked', reason: 'unknown_event_type' };
    }
  }

  /** The acceptance email carries a fresh scheduling link when possible. */
  async function issueSchedulingLink(applicationId: string) {
    if (!scheduling) return undefined;
    try {
      return await scheduling.issueAccess(applicationId, null);
    } catch (error) {
      // Not configured (503) or no longer awaiting a booking (409): the email
      // still goes out, without a link; staff can issue one later.
      if (error instanceof AppError) {
        logger.warn(
          { applicationId, errorCode: error.code },
          'acceptance email sent without a scheduling link',
        );
        return undefined;
      }
      throw error;
    }
  }

  async function settle(
    event: ClaimedEvent,
    error: string,
    permanent: boolean,
  ): Promise<'retried' | 'failed'> {
    if (permanent || event.attempts >= options.maxAttempts) {
      await repository.failEvent(event.id, error);
      logger.error(
        {
          notificationEventId: event.id,
          eventType: event.eventType,
          attempts: event.attempts,
          error,
        },
        'notification permanently failed',
      );
      return 'failed';
    }
    const retryInMs = backoffMs(event.attempts);
    await repository.retryEvent(event.id, error, retryInMs);
    logger.warn(
      {
        notificationEventId: event.id,
        eventType: event.eventType,
        attempts: event.attempts,
        error,
        retryInMs,
      },
      'notification will be retried',
    );
    return 'retried';
  }

  async function processEvent(event: ClaimedEvent): Promise<'processed' | 'retried' | 'failed'> {
    const planned = await plan(event);
    if (planned.kind === 'skip') {
      await repository.completeEvent(event.id);
      logger.info(
        { notificationEventId: event.id, eventType: event.eventType, reason: planned.reason },
        'notification skipped',
      );
      return 'processed';
    }
    if (planned.kind === 'blocked') return settle(event, planned.reason, true);

    let failure: { code: string; retryable: boolean } | undefined;
    for (const message of planned.messages) {
      const delivery = await repository.ensureDelivery({
        notificationEventId: event.id,
        template: message.template,
        eventType: event.eventType,
        recipient: message.to.toLowerCase(),
        provider: provider.name,
      });
      if (delivery.status === 'SENT') continue;

      try {
        const email = await message.render();
        const result = await provider.send({
          from: options.from,
          to: [message.to],
          replyTo: message.replyTo ?? options.replyTo,
          subject: email.subject,
          html: email.html,
          text: email.text,
          idempotencyKey: delivery.id,
          tags: { template: message.template.replace('.', '_') },
        });
        await repository.markDeliverySent(delivery.id, {
          provider: provider.name,
          providerMessageId: result.providerMessageId,
        });
        logger.info(
          {
            notificationEventId: event.id,
            deliveryId: delivery.id,
            template: message.template,
            providerMessageId: result.providerMessageId,
          },
          'notification sent',
        );
      } catch (error) {
        const code = error instanceof EmailSendError ? error.code : 'internal_error';
        const retryable = error instanceof EmailSendError ? error.retryable : true;
        await repository.markDeliveryFailed(delivery.id, { provider: provider.name, error: code });
        logger.warn(
          {
            notificationEventId: event.id,
            deliveryId: delivery.id,
            template: message.template,
            error: code,
            retryable,
            ...(error instanceof EmailSendError ? {} : { err: error }),
          },
          'notification delivery failed',
        );
        // Keep going: other recipients should still get their copy.
        if (!failure || !retryable) failure = { code, retryable };
      }
    }

    if (!failure) {
      await repository.completeEvent(event.id);
      return 'processed';
    }
    return settle(event, failure.code, !failure.retryable);
  }

  return {
    async runOnce(runOptions = {}) {
      const claimed = await repository.claimDue({
        limit: options.batchSize,
        leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
      });
      const summary = { claimed: claimed.length, released: 0, processed: 0, retried: 0, failed: 0 };
      for (const event of claimed) {
        if (runOptions.signal?.aborted) {
          await repository.releaseEvent(event.id);
          summary.released += 1;
          continue;
        }
        let outcome: 'processed' | 'retried' | 'failed';
        try {
          outcome = await processEvent(event);
        } catch (error) {
          // Unexpected (e.g. database): retry later rather than lose the event.
          logger.error(
            { err: error, notificationEventId: event.id },
            'notification processing error',
          );
          outcome = await settle(event, 'internal_error', false);
        }
        summary[outcome] += 1;
      }
      return summary;
    },
  };
}
