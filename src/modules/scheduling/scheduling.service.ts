import type { ApplicationStatus } from '../../db/schema/enums.js';
import {
  SchedulingProviderUnavailableError,
  WebhookPayloadError,
  WebhookVerificationError,
  type BookingEvent,
  type ProviderBooking,
  type SchedulingProvider,
  type WebhookRequest,
} from '../../providers/scheduling/scheduling-provider.js';
import { AppError } from '../../shared/errors/app-error.js';
import {
  deriveFromToken,
  generateAccessToken,
  hashAccessToken,
  isWellFormedAccessToken,
} from '../../shared/security/access-tokens.js';
import { applyTransition } from '../applications/application-lifecycle.js';
import type { LifecycleTransaction } from '../applications/applications.repository.js';
import type {
  MeetingRow,
  SchedulingRepository,
  WebhookResult,
  WebhookTransaction,
} from './scheduling.repository.js';

/**
 * Scheduling domain (BUILD_PLAN Phase 6). Provider-agnostic: it talks to a
 * SchedulingProvider and never sees provider payloads or secrets.
 *
 * Eligibility: only applications in SCHEDULING_OPEN (accepted, no active
 * booking) can receive or use scheduling access. NEW, UNDER_REVIEW, REJECTED,
 * WITHDRAWN, ... never can.
 *
 * Access: `issueAccess` creates a short-lived random token (only its hash is
 * stored) and rotates any previous one. The applicant presents it to
 * `resolveAccess`, which reveals the provider booking URL. That URL carries a
 * booking reference derived one-way from the token; the provider echoes it in
 * webhooks and we match it by hash, so bookings link to applications without
 * storing any raw secret.
 *
 * Webhooks: verified by the provider adapter (signature over the raw body),
 * deduplicated by provider event id, and applied in one transaction with the
 * application row locked:
 *   created     → meeting SCHEDULED; SCHEDULING_OPEN → SCHEDULED
 *   rescheduled → old meeting RESCHEDULED, new meeting SCHEDULED; event
 *                 BOOKING_RESCHEDULED (status stays SCHEDULED)
 *   cancelled   → meeting CANCELLED; SCHEDULED → SCHEDULING_OPEN (may rebook)
 * Bookings that cannot be linked, or that belong to an ineligible
 * application, change nothing and raise SCHEDULING_BOOKING_NEEDS_ATTENTION so
 * staff can cancel them at the provider.
 */

export const BOOKING_REF_PURPOSE = 'booking-ref';

export interface IssuedAccess {
  readonly token: string;
  readonly expiresAt: Date;
  /** Frontend page link (token in the URL fragment), if SCHEDULING_PAGE_URL is set. */
  readonly link: string | null;
}

export interface ResolvedAccess {
  readonly schedulingUrl: string;
  readonly expiresAt: Date;
}

export interface BookingLookup {
  readonly meeting: Pick<MeetingRow, 'id' | 'status' | 'startsAt' | 'endsAt' | 'meetingUrl'>;
  /** The provider's current view; null if the provider no longer knows it. */
  readonly providerBooking: ProviderBooking | null;
}

export type WebhookHandlingResult =
  | { readonly duplicate: true }
  | { readonly duplicate: false; readonly outcome: WebhookResult['outcome'] };

export interface SchedulingService {
  readonly providerName: string | undefined;
  /** Staff (actor id) or the system (null) issues/re-issues access. */
  issueAccess(applicationId: string, actorId: string | null): Promise<IssuedAccess>;
  resolveAccess(token: string | undefined): Promise<ResolvedAccess>;
  handleWebhook(providerName: string, request: WebhookRequest): Promise<WebhookHandlingResult>;
  lookupBooking(applicationId: string): Promise<BookingLookup>;
}

export interface SchedulingServiceLogger {
  info(object: object, message: string): void;
  warn(object: object, message: string): void;
}

const notConfigured = () =>
  new AppError(503, 'SERVICE_UNAVAILABLE', 'Scheduling is not configured.');
const notFound = () => new AppError(404, 'NOT_FOUND', 'Scheduling link not found or expired.');

export function createSchedulingService(deps: {
  repository: SchedulingRepository | undefined;
  provider: SchedulingProvider | undefined;
  tokenTtlMs: number;
  pageUrl: string | undefined;
  logger: SchedulingServiceLogger;
  now?: () => Date;
}): SchedulingService {
  const { provider, repository, logger } = deps;
  const now = deps.now ?? (() => new Date());

  function configured(): { provider: SchedulingProvider; repository: SchedulingRepository } {
    if (!provider || !repository) throw notConfigured();
    return { provider, repository };
  }

  const bookingRefHash = (token: string) =>
    hashAccessToken(deriveFromToken(token, BOOKING_REF_PURPOSE));

  // ---- Webhook event handlers (run inside the webhook transaction) -------------------

  async function needsAttention(
    tx: WebhookTransaction,
    result: WebhookResult,
  ): Promise<WebhookResult> {
    await tx.enqueueNotificationEvent({
      eventType: 'SCHEDULING_BOOKING_NEEDS_ATTENTION',
      subjectType: 'scheduling_webhook_event',
      subjectId: tx.webhookEventId,
    });
    return result;
  }

  async function bookInto(
    tx: WebhookTransaction,
    lifecycle: LifecycleTransaction,
    booking: ProviderBooking,
    providerName: string,
  ): Promise<string> {
    const applicationId = lifecycle.application.id;
    const meetingId = await tx.insertMeeting({
      applicationId,
      provider: providerName,
      providerEventId: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      meetingUrl: booking.meetingUrl,
    });
    await applyTransition(
      lifecycle,
      {
        to: 'SCHEDULED',
        actor: { type: 'PROVIDER' },
        metadata: { meetingId, provider: providerName },
      },
      now(),
    );
    await tx.setSessionUsedAt(applicationId, now());
    await lifecycle.enqueueNotificationEvent({
      eventType: 'MEETING_BOOKED',
      subjectType: 'meeting',
      subjectId: meetingId,
    });
    return meetingId;
  }

  async function onCreated(
    tx: WebhookTransaction,
    event: Extract<BookingEvent, { kind: 'BOOKING_CREATED' }>,
    providerName: string,
  ): Promise<WebhookResult> {
    const bookingId = event.booking.id;
    const applicationId = event.bookingRef
      ? await tx.findApplicationIdByBookingRefHash(hashAccessToken(event.bookingRef))
      : undefined;
    if (!applicationId) return needsAttention(tx, { outcome: 'UNMATCHED', bookingId });

    const lifecycle = await tx.lockApplication(applicationId);
    if (!lifecycle) return needsAttention(tx, { outcome: 'UNMATCHED', bookingId });
    // Same booking delivered under another event id: already applied.
    if (await tx.findMeetingByBookingId(bookingId)) {
      return { outcome: 'IGNORED', bookingId, applicationId };
    }
    if (lifecycle.application.status !== 'SCHEDULING_OPEN') {
      return needsAttention(tx, { outcome: 'NOT_ELIGIBLE', bookingId, applicationId });
    }
    await bookInto(tx, lifecycle, event.booking, providerName);
    return { outcome: 'PROCESSED', bookingId, applicationId };
  }

  async function onRescheduled(
    tx: WebhookTransaction,
    event: Extract<BookingEvent, { kind: 'BOOKING_RESCHEDULED' }>,
    providerName: string,
  ): Promise<WebhookResult> {
    const bookingId = event.booking.id;
    const previous = event.previousBookingId
      ? await tx.findMeetingByBookingId(event.previousBookingId)
      : undefined;
    const applicationId =
      previous?.applicationId ??
      (event.bookingRef
        ? await tx.findApplicationIdByBookingRefHash(hashAccessToken(event.bookingRef))
        : undefined);
    if (!applicationId) return needsAttention(tx, { outcome: 'UNMATCHED', bookingId });

    const lifecycle = await tx.lockApplication(applicationId);
    if (!lifecycle) return needsAttention(tx, { outcome: 'UNMATCHED', bookingId });
    if (await tx.findMeetingByBookingId(bookingId)) {
      return { outcome: 'IGNORED', bookingId, applicationId };
    }

    const status: ApplicationStatus = lifecycle.application.status;
    if (status === 'SCHEDULING_OPEN') {
      // The earlier booking was already cancelled: treat as a fresh booking.
      await bookInto(tx, lifecycle, event.booking, providerName);
      return { outcome: 'PROCESSED', bookingId, applicationId };
    }
    if (status !== 'SCHEDULED') {
      return needsAttention(tx, { outcome: 'NOT_ELIGIBLE', bookingId, applicationId });
    }

    const replaced = previous ?? (await tx.findActiveMeeting(applicationId));
    if (replaced?.status === 'SCHEDULED') await tx.setMeetingStatus(replaced.id, 'RESCHEDULED');
    const meetingId = await tx.insertMeeting({
      applicationId,
      provider: providerName,
      providerEventId: bookingId,
      startsAt: event.booking.startsAt,
      endsAt: event.booking.endsAt,
      meetingUrl: event.booking.meetingUrl,
    });
    await lifecycle.insertEvent({
      applicationId,
      eventType: 'BOOKING_RESCHEDULED',
      actorType: 'PROVIDER',
      actorId: null,
      metadata: { meetingId, previousMeetingId: replaced?.id ?? null, provider: providerName },
    });
    await lifecycle.enqueueNotificationEvent({
      eventType: 'MEETING_RESCHEDULED',
      subjectType: 'meeting',
      subjectId: meetingId,
    });
    return { outcome: 'PROCESSED', bookingId, applicationId };
  }

  async function onCancelled(
    tx: WebhookTransaction,
    event: Extract<BookingEvent, { kind: 'BOOKING_CANCELLED' }>,
  ): Promise<WebhookResult> {
    const bookingId = event.bookingId;
    const found = await tx.findMeetingByBookingId(bookingId);
    // A booking we never linked: nothing of ours to cancel.
    if (!found) return { outcome: 'UNMATCHED', bookingId };

    const lifecycle = await tx.lockApplication(found.applicationId);
    const meeting = await tx.findMeetingByBookingId(bookingId); // re-read under the lock
    if (!lifecycle || meeting?.status !== 'SCHEDULED') {
      return { outcome: 'IGNORED', bookingId, applicationId: found.applicationId };
    }

    await tx.setMeetingStatus(meeting.id, 'CANCELLED');
    if (
      lifecycle.application.status === 'SCHEDULED' &&
      !(await tx.findActiveMeeting(meeting.applicationId))
    ) {
      // Back to "may book": the applicant can use their link again if unexpired.
      await applyTransition(
        lifecycle,
        { to: 'SCHEDULING_OPEN', actor: { type: 'PROVIDER' }, metadata: { meetingId: meeting.id } },
        now(),
      );
      await tx.setSessionUsedAt(meeting.applicationId, null);
    }
    await lifecycle.enqueueNotificationEvent({
      eventType: 'MEETING_CANCELLED',
      subjectType: 'meeting',
      subjectId: meeting.id,
    });
    return { outcome: 'PROCESSED', bookingId, applicationId: meeting.applicationId };
  }

  // ---- Service --------------------------------------------------------------------------

  return {
    providerName: provider?.name,

    async issueAccess(applicationId, actorId) {
      const ctx = configured();
      const token = generateAccessToken();
      const expiresAt = new Date(now().getTime() + deps.tokenTtlMs);

      const issued = await ctx.repository.withApplicationForIssue(applicationId, async (tx) => {
        if (tx.lifecycle.application.status !== 'SCHEDULING_OPEN') {
          throw new AppError(
            409,
            'CONFLICT',
            'Scheduling access can only be issued for an accepted application that is awaiting a booking.',
          );
        }
        const previous = await tx.findSession();
        const sessionId = await tx.upsertSession({
          provider: ctx.provider.name,
          tokenHash: hashAccessToken(token),
          bookingRefHash: bookingRefHash(token),
          expiresAt,
        });
        await tx.lifecycle.insertAuditLog({
          actorId,
          action: 'application.scheduling_access_issued',
          entityType: 'application',
          entityId: applicationId,
          metadata: { expiresAt: expiresAt.toISOString(), reissued: previous?.hasToken ?? false },
        });
        return { sessionId, reissued: previous?.hasToken ?? false };
      });
      if (!issued) throw new AppError(404, 'NOT_FOUND', 'Application not found.');

      if (issued.reissued) {
        // After commit, never inside the transaction. Best effort: the old token
        // is already unusable because its hash was replaced.
        ctx.provider
          .revokeSchedulingAccess({ sessionId: issued.sessionId })
          .catch((error: unknown) => {
            logger.warn({ err: error, applicationId }, 'provider revoke after re-issue failed');
          });
      }
      logger.info({ applicationId, reissued: issued.reissued }, 'scheduling access issued');
      return {
        token,
        expiresAt,
        link: deps.pageUrl ? `${deps.pageUrl}#token=${token}` : null,
      };
    },

    async resolveAccess(token) {
      const ctx = configured();
      if (token === undefined || !isWellFormedAccessToken(token)) {
        throw new AppError(401, 'UNAUTHORIZED', 'A valid scheduling token is required.');
      }
      // One query for every failure (unknown, expired, used, ineligible): same 404.
      const session = await ctx.repository.findResolvableSession(hashAccessToken(token), now());
      if (!session) throw notFound();
      const access = await ctx.provider.createSchedulingAccess({
        sessionId: session.sessionId,
        bookingRef: deriveFromToken(token, BOOKING_REF_PURPOSE),
        attendee: session.attendee,
      });
      return { schedulingUrl: access.schedulingUrl, expiresAt: session.expiresAt };
    },

    async handleWebhook(providerName, request) {
      const ctx = configured();
      if (providerName !== ctx.provider.name) {
        throw new AppError(404, 'NOT_FOUND', 'Route not found.');
      }

      let verified;
      try {
        verified = await ctx.provider.verifyWebhook(request);
      } catch (error) {
        if (error instanceof WebhookVerificationError) {
          logger.warn({ provider: providerName }, 'scheduling webhook rejected: bad signature');
          throw new AppError(401, 'UNAUTHORIZED', 'Invalid webhook signature.');
        }
        if (error instanceof WebhookPayloadError) {
          logger.warn(
            { provider: providerName, err: error },
            'scheduling webhook rejected: bad payload',
          );
          throw new AppError(400, 'BAD_REQUEST', 'Unrecognized webhook payload.');
        }
        throw error;
      }

      const { event } = verified;
      const handled = await ctx.repository.processWebhookOnce(
        {
          provider: providerName,
          eventId: verified.eventId,
          eventType: verified.eventType,
          now: now(),
        },
        (tx) => {
          switch (event.kind) {
            case 'BOOKING_CREATED':
              return onCreated(tx, event, providerName);
            case 'BOOKING_RESCHEDULED':
              return onRescheduled(tx, event, providerName);
            case 'BOOKING_CANCELLED':
              return onCancelled(tx, event);
            case 'IGNORED':
              return Promise.resolve({ outcome: 'IGNORED' });
          }
        },
      );

      // Ids and classifications only: payloads contain attendee personal data.
      const logged = {
        provider: providerName,
        eventType: verified.eventType,
        duplicate: handled.duplicate,
        ...(handled.duplicate ? {} : handled.result),
      };
      if (
        !handled.duplicate &&
        handled.result.outcome !== 'PROCESSED' &&
        handled.result.outcome !== 'IGNORED'
      ) {
        logger.warn(logged, 'scheduling webhook needs attention');
      } else {
        logger.info(logged, 'scheduling webhook handled');
      }
      return handled.duplicate
        ? { duplicate: true }
        : { duplicate: false, outcome: handled.result.outcome };
    },

    async lookupBooking(applicationId) {
      const ctx = configured();
      const meeting = await ctx.repository.findLatestMeeting(applicationId);
      if (!meeting?.providerEventId) {
        throw new AppError(404, 'NOT_FOUND', 'This application has no booking.');
      }
      try {
        const providerBooking = await ctx.provider.getBooking({
          bookingId: meeting.providerEventId,
        });
        const { id, status, startsAt, endsAt, meetingUrl } = meeting;
        return { meeting: { id, status, startsAt, endsAt, meetingUrl }, providerBooking };
      } catch (error) {
        if (error instanceof SchedulingProviderUnavailableError) {
          logger.warn({ err: error, applicationId }, 'provider booking lookup failed');
          throw new AppError(503, 'SERVICE_UNAVAILABLE', 'The scheduling provider is unavailable.');
        }
        throw error;
      }
    },
  };
}
