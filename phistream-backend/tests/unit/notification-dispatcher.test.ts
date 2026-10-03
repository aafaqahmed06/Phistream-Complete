import { describe, expect, it, vi } from 'vitest';

import {
  backoffMs,
  createNotificationDispatcher,
  type SchedulingLinkIssuer,
} from '../../src/modules/notifications/dispatcher.js';
import type { NotificationContext } from '../../src/modules/notifications/notification-context.js';
import { createNotificationWorker } from '../../src/modules/notifications/worker.js';
import { EmailSendError } from '../../src/providers/email/email-provider.js';
import { AppError } from '../../src/shared/errors/app-error.js';
import {
  createFakeEmailProvider,
  createFakeNotificationContext,
  createFakeNotificationsRepository,
} from '../helpers/fake-notifications.js';

const NOW = new Date('2026-07-01T12:00:00Z');
const APP_ID = '00000000-0000-4000-8000-000000000701';
const CONTACT_ID = '00000000-0000-4000-8000-000000000801';
const MEETING_ID = '00000000-0000-4000-8000-000000000901';

const application = {
  id: APP_ID,
  reference: 'PHI-2026-ABC123',
  applicantName: 'Jane Doe',
  applicantEmail: 'Jane@Example.com',
  serviceTierName: null,
  source: 'instagram',
  submittedAt: NOW,
};
const contact = {
  name: 'Sam Sender',
  email: 'sam@example.com',
  phone: null,
  companyName: null,
  message: 'PRIVATE-MESSAGE-BODY',
  source: null,
  campaign: null,
  receivedAt: NOW,
};
const meeting = {
  applicationId: APP_ID,
  reference: 'PHI-2026-ABC123',
  applicantName: 'Jane Doe',
  applicantEmail: 'jane@example.com',
  startsAt: new Date('2026-07-05T15:00:00Z'),
  endsAt: new Date('2026-07-05T15:30:00Z'),
  meetingUrl: 'https://meet.example.com/abc',
  status: 'SCHEDULED' as const,
};

function setup(
  options: {
    context?: NotificationContext;
    scheduling?: SchedulingLinkIssuer;
    staff?: string[];
    maxAttempts?: number;
  } = {},
) {
  let clock = NOW;
  const store = createFakeNotificationsRepository({ now: () => clock });
  const provider = createFakeEmailProvider();
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const context =
    options.context ??
    createFakeNotificationContext({
      contacts: { [CONTACT_ID]: contact },
      applications: { [APP_ID]: application },
      meetings: { [MEETING_ID]: meeting },
      ...(options.staff ? { staff: options.staff } : {}),
    });
  const dispatcher = createNotificationDispatcher({
    repository: store.repository,
    context,
    provider,
    scheduling: options.scheduling,
    options: {
      from: 'Phistream Studio <hello@mail.example.com>',
      replyTo: 'team@example.com',
      adminDashboardUrl: 'https://admin.example.com',
      batchSize: 10,
      maxAttempts: options.maxAttempts ?? 3,
    },
    logger,
  });
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  return { ...store, provider, logger, dispatcher, advance };
}

describe('notification dispatcher', () => {
  describe('templates and recipients', () => {
    it('contact received → every staff recipient, replying to the sender', async () => {
      const ctx = setup({ staff: ['a@example.com', 'b@example.com'] });
      const event = ctx.enqueue('CONTACT_RECEIVED', 'contact_submission', CONTACT_ID);

      expect(await ctx.dispatcher.runOnce()).toEqual({
        claimed: 1,
        released: 0,
        processed: 1,
        retried: 0,
        failed: 0,
      });
      expect(ctx.provider.sent.map((m) => [m.to, m.replyTo, m.from])).toEqual([
        [['a@example.com'], 'sam@example.com', 'Phistream Studio <hello@mail.example.com>'],
        [['b@example.com'], 'sam@example.com', 'Phistream Studio <hello@mail.example.com>'],
      ]);
      expect(ctx.provider.sent[0]?.text).toContain('PRIVATE-MESSAGE-BODY');
      expect(
        ctx.deliveries.map((d) => [
          d.template,
          d.recipient,
          d.status,
          d.providerMessageId,
          d.provider,
        ]),
      ).toEqual([
        ['staff.contact_received', 'a@example.com', 'SENT', 'fake_1', 'fake'],
        ['staff.contact_received', 'b@example.com', 'SENT', 'fake_2', 'fake'],
      ]);
      expect(event).toMatchObject({ status: 'PROCESSED', processedAt: NOW, lockedUntil: null });
    });

    it('uses the delivery id as the provider idempotency key', async () => {
      const ctx = setup();
      ctx.enqueue('CONTACT_RECEIVED', 'contact_submission', CONTACT_ID);
      await ctx.dispatcher.runOnce();
      expect(ctx.provider.sent[0]?.idempotencyKey).toBe(ctx.deliveries[0]?.id);
    });

    it('new application → staff, with a dashboard link and the default reply-to', async () => {
      const ctx = setup();
      ctx.enqueue('APPLICATION_SUBMITTED', 'application', APP_ID);
      await ctx.dispatcher.runOnce();

      expect(ctx.deliveries.map((d) => d.template)).toEqual(['staff.application_submitted']);
      expect(ctx.provider.sent[0]?.html).toContain(
        `https://admin.example.com/applications/${APP_ID}`,
      );
      expect(ctx.provider.sent[0]?.replyTo).toBe('team@example.com');
    });

    it('rejected → applicant only (lower-cased recipient on the delivery)', async () => {
      const ctx = setup();
      ctx.enqueue('APPLICATION_REJECTED', 'application', APP_ID);
      await ctx.dispatcher.runOnce();

      expect(ctx.deliveries.map((d) => [d.template, d.recipient])).toEqual([
        ['applicant.application_rejected', 'jane@example.com'],
      ]);
    });

    it.each([
      ['MEETING_BOOKED', 'booked'],
      ['MEETING_RESCHEDULED', 'rescheduled'],
      ['MEETING_CANCELLED', 'cancelled'],
    ])('%s → applicant and staff', async (eventType, change) => {
      const ctx = setup();
      ctx.enqueue(eventType, 'meeting', MEETING_ID);
      await ctx.dispatcher.runOnce();

      expect(ctx.deliveries.map((d) => [d.template, d.recipient])).toEqual([
        [`applicant.meeting_${change}`, 'jane@example.com'],
        [`staff.meeting_${change}`, 'staff@example.com'],
      ]);
    });

    it('meeting emails still reach the applicant when no staff recipient exists', async () => {
      const ctx = setup({ staff: [] });
      const event = ctx.enqueue('MEETING_BOOKED', 'meeting', MEETING_ID);
      await ctx.dispatcher.runOnce();

      expect(ctx.deliveries.map((d) => d.template)).toEqual(['applicant.meeting_booked']);
      expect(event.status).toBe('PROCESSED');
    });

    it('scheduling needs attention → staff', async () => {
      const ctx = setup({
        context: createFakeNotificationContext({
          webhooks: {
            w1: {
              provider: 'calcom',
              eventType: 'BOOKING_CREATED',
              outcome: 'UNMATCHED',
              bookingId: 'uid-1',
              applicationId: null,
              reference: null,
              receivedAt: NOW,
            },
          },
        }),
      });
      ctx.enqueue('SCHEDULING_BOOKING_NEEDS_ATTENTION', 'scheduling_webhook_event', 'w1');
      await ctx.dispatcher.runOnce();
      expect(ctx.deliveries.map((d) => d.template)).toEqual(['staff.scheduling_needs_attention']);
    });
  });

  describe('acceptance email and scheduling links', () => {
    it('issues a scheduling link (as the system) and puts it in the email', async () => {
      const issueAccess = vi.fn(() =>
        Promise.resolve({ link: 'https://phistream.example/schedule#token=tok', expiresAt: NOW }),
      );
      const ctx = setup({ scheduling: { issueAccess } });
      ctx.enqueue('APPLICATION_ACCEPTED', 'application', APP_ID);
      await ctx.dispatcher.runOnce();

      expect(issueAccess).toHaveBeenCalledWith(APP_ID, null);
      expect(ctx.provider.sent[0]?.html).toContain('https://phistream.example/schedule#token=tok');
      expect(ctx.deliveries[0]?.template).toBe('applicant.application_accepted');
    });

    it.each([
      ['scheduling is not configured', new AppError(503, 'SERVICE_UNAVAILABLE', 'x')],
      ['the application is no longer awaiting a booking', new AppError(409, 'CONFLICT', 'x')],
    ])('sends without a link when %s', async (_, error) => {
      const ctx = setup({ scheduling: { issueAccess: () => Promise.reject(error) } });
      const event = ctx.enqueue('APPLICATION_ACCEPTED', 'application', APP_ID);
      await ctx.dispatcher.runOnce();

      expect(ctx.provider.sent[0]?.text).toContain('We will be in touch shortly');
      expect(event.status).toBe('PROCESSED');
    });

    it('does not issue a new link for an email that was already sent', async () => {
      const issueAccess = vi.fn(() =>
        Promise.resolve({ link: 'https://x.example/#token=t', expiresAt: NOW }),
      );
      const ctx = setup({ scheduling: { issueAccess } });
      const event = ctx.enqueue('APPLICATION_ACCEPTED', 'application', APP_ID);
      await ctx.dispatcher.runOnce();
      // Simulate a redelivery of the same event (e.g. manual requeue).
      Object.assign(event, { status: 'PENDING', nextAttemptAt: NOW });
      await ctx.dispatcher.runOnce();

      expect(issueAccess).toHaveBeenCalledTimes(1);
      expect(ctx.provider.sent).toHaveLength(1);
    });
  });

  describe('failures and retries', () => {
    it('retries a transient failure with backoff and sends only what is missing', async () => {
      const ctx = setup({ staff: ['a@example.com', 'b@example.com'] });
      const event = ctx.enqueue('CONTACT_RECEIVED', 'contact_submission', CONTACT_ID);
      ctx.provider.failNext(new EmailSendError('resend_429_rate_limit_exceeded', true));

      expect(await ctx.dispatcher.runOnce()).toMatchObject({ retried: 1 });
      expect(event).toMatchObject({
        status: 'PENDING',
        attempts: 1,
        lastError: 'resend_429_rate_limit_exceeded',
        nextAttemptAt: new Date(NOW.getTime() + 60_000),
        lockedUntil: null,
      });
      // The other recipient was still served.
      expect(ctx.deliveries.map((d) => [d.recipient, d.status])).toEqual([
        ['a@example.com', 'FAILED'],
        ['b@example.com', 'SENT'],
      ]);

      // Not due yet.
      expect((await ctx.dispatcher.runOnce()).claimed).toBe(0);
      ctx.advance(60_000);
      expect(await ctx.dispatcher.runOnce()).toMatchObject({ processed: 1 });
      expect(ctx.provider.sent.map((m) => m.to[0])).toEqual(['b@example.com', 'a@example.com']);
      expect(ctx.deliveries.every((d) => d.status === 'SENT')).toBe(true);
      expect(event).toMatchObject({ status: 'PROCESSED', lastError: null });
    });

    it('dead-letters after the maximum number of attempts', async () => {
      const ctx = setup({ maxAttempts: 3 });
      const event = ctx.enqueue('APPLICATION_REJECTED', 'application', APP_ID);
      ctx.provider.failNext(new EmailSendError('resend_503', true), 3);

      for (let i = 0; i < 3; i++) {
        await ctx.dispatcher.runOnce();
        ctx.advance(backoffMs(i + 1));
      }

      expect(event).toMatchObject({ status: 'FAILED', attempts: 3, lastError: 'resend_503' });
      expect(ctx.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationEventId: event.id,
          error: 'resend_503',
          attempts: 3,
        }),
        'notification permanently failed',
      );
      ctx.advance(24 * 3600_000);
      expect((await ctx.dispatcher.runOnce()).claimed).toBe(0);
    });

    it('dead-letters immediately on a permanent provider error', async () => {
      const ctx = setup();
      const event = ctx.enqueue('APPLICATION_REJECTED', 'application', APP_ID);
      ctx.provider.failNext(new EmailSendError('resend_422_validation_error', false));
      await ctx.dispatcher.runOnce();

      expect(event).toMatchObject({
        status: 'FAILED',
        attempts: 1,
        lastError: 'resend_422_validation_error',
      });
    });

    it('dead-letters staff notifications when there is nobody to send them to', async () => {
      const ctx = setup({ staff: [] });
      const event = ctx.enqueue('APPLICATION_SUBMITTED', 'application', APP_ID);
      await ctx.dispatcher.runOnce();

      expect(event).toMatchObject({ status: 'FAILED', lastError: 'no_staff_recipients' });
      expect(ctx.provider.sent).toEqual([]);
    });

    it('completes events whose subject was deleted, sending nothing', async () => {
      const ctx = setup();
      const event = ctx.enqueue(
        'APPLICATION_REJECTED',
        'application',
        '00000000-0000-4000-8000-000000000999',
      );
      await ctx.dispatcher.runOnce();

      expect(event.status).toBe('PROCESSED');
      expect(ctx.provider.sent).toEqual([]);
    });

    it('dead-letters unknown event types', async () => {
      const ctx = setup();
      const event = ctx.enqueue('SOMETHING_NEW', 'application', APP_ID);
      await ctx.dispatcher.runOnce();
      expect(event).toMatchObject({ status: 'FAILED', lastError: 'unknown_event_type' });
    });

    it('retries after unexpected errors (e.g. the database) instead of losing the event', async () => {
      const failing = createFakeNotificationContext({});
      failing.application = () => Promise.reject(new Error('connection reset'));
      const ctx = setup({ context: failing });
      const event = ctx.enqueue('APPLICATION_REJECTED', 'application', APP_ID);

      expect(await ctx.dispatcher.runOnce()).toMatchObject({ retried: 1 });
      expect(event).toMatchObject({ status: 'PENDING', lastError: 'internal_error' });
    });

    it('does not re-claim an event while its lease is held', async () => {
      const ctx = setup();
      const event = ctx.enqueue('APPLICATION_REJECTED', 'application', APP_ID);
      await ctx.repository.claimDue({ limit: 10, leaseMs: 60_000 }); // another worker

      expect((await ctx.dispatcher.runOnce()).claimed).toBe(0);
      ctx.advance(60_001); // that worker died; its lease expires
      expect((await ctx.dispatcher.runOnce()).processed).toBe(1);
      expect(event.attempts).toBe(2);
    });

    it('backs off exponentially up to one hour', () => {
      expect([1, 2, 3, 4, 7, 20].map(backoffMs)).toEqual([
        60_000, 120_000, 240_000, 480_000, 3_600_000, 3_600_000,
      ]);
    });
  });

  describe('logging', () => {
    it('never logs recipients, subjects, or bodies', async () => {
      const ctx = setup({ staff: ['staff.secret@example.com'] });
      ctx.enqueue('CONTACT_RECEIVED', 'contact_submission', CONTACT_ID);
      ctx.enqueue('APPLICATION_REJECTED', 'application', APP_ID);
      ctx.provider.failNext(new EmailSendError('resend_500', true));
      await ctx.dispatcher.runOnce();

      const logged = JSON.stringify([
        ctx.logger.info.mock.calls,
        ctx.logger.warn.mock.calls,
        ctx.logger.error.mock.calls,
      ]);
      for (const secret of [
        'staff.secret@example.com',
        'sam@example.com',
        'jane@example.com',
        'PRIVATE-MESSAGE-BODY',
        'Sam Sender',
        'Jane Doe',
      ]) {
        expect(logged).not.toContain(secret);
      }
      expect(logged).toContain('notification sent');
      expect(logged).toContain('resend_500');
    });
  });
});

describe('notification worker', () => {
  it('polls, drains a backlog back to back, survives errors, and stops cleanly', async () => {
    const runOnce = vi
      .fn()
      .mockResolvedValueOnce({ claimed: 2, processed: 2, retried: 0, failed: 0 }) // full batch
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue({ claimed: 0, processed: 0, retried: 0, failed: 0 });
    const logger = { error: vi.fn() };
    const worker = createNotificationWorker({
      dispatcher: { runOnce },
      intervalMs: 200,
      batchSize: 2,
      logger,
    });

    const startedAt = Date.now();
    worker.start();
    // A full batch is followed immediately by another (backlog), well before the interval.
    await vi.waitFor(
      () => {
        expect(runOnce).toHaveBeenCalledTimes(2);
      },
      { timeout: 150 },
    );
    expect(Date.now() - startedAt).toBeLessThan(150);
    expect(logger.error).toHaveBeenCalledOnce();

    // After the error, the worker keeps going on the normal interval.
    await vi.waitFor(
      () => {
        expect(runOnce).toHaveBeenCalledTimes(3);
      },
      { timeout: 1000 },
    );

    await worker.stop();
    const calls = runOnce.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 450));
    expect(runOnce).toHaveBeenCalledTimes(calls);
  });
});

describe('dispatcher shutdown', () => {
  it('hands unstarted events back when aborted, instead of holding their leases', async () => {
    const store = createFakeNotificationsRepository();
    const provider = createFakeEmailProvider();
    const first = store.enqueue('APPLICATION_REJECTED', 'application', APP_ID);
    const second = store.enqueue('APPLICATION_REJECTED', 'application', APP_ID);
    const abort = new AbortController();
    const context = createFakeNotificationContext({ applications: { [APP_ID]: application } });
    const originalApplication = context.application.bind(context);
    // Shutdown is requested while the first event is being processed.
    context.application = (id) => {
      abort.abort();
      return originalApplication(id);
    };
    const dispatcher = createNotificationDispatcher({
      repository: store.repository,
      context,
      provider,
      scheduling: undefined,
      options: {
        from: 'x@example.com',
        replyTo: undefined,
        adminDashboardUrl: undefined,
        batchSize: 10,
        maxAttempts: 3,
      },
      logger: { info: () => undefined, warn: () => undefined, error: () => undefined },
    });

    expect(await dispatcher.runOnce({ signal: abort.signal })).toMatchObject({
      claimed: 2,
      processed: 1,
      released: 1,
    });
    expect(first.status).toBe('PROCESSED');
    expect(second).toMatchObject({ status: 'PENDING', lockedUntil: null, attempts: 0 });
    expect(provider.sent).toHaveLength(1);
  });
});
