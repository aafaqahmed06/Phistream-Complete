import { randomUUID } from 'node:crypto';

import type { NotificationEventStatus, NotificationStatus } from '../../src/db/schema/enums.js';
import type {
  ApplicationContext,
  ContactContext,
  MeetingContext,
  NotificationContext,
  WebhookEventContext,
} from '../../src/modules/notifications/notification-context.js';
import type { NotificationsRepository } from '../../src/modules/notifications/notifications.repository.js';
import {
  type EmailSendError,
  type EmailProvider,
  type SendEmailInput,
} from '../../src/providers/email/email-provider.js';

export interface FakeEvent {
  id: string;
  eventType: string;
  subjectType: string;
  subjectId: string;
  status: NotificationEventStatus;
  attempts: number;
  lastError: string | null;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  processedAt: Date | null;
}

export interface FakeDelivery {
  id: string;
  notificationEventId: string;
  template: string;
  recipient: string;
  eventType: string;
  provider: string;
  status: NotificationStatus;
  attempts: number;
  lastError: string | null;
  providerMessageId: string | null;
}

/**
 * In-memory NotificationsRepository with the real claim/lease semantics.
 * `now` plays the role of the database clock.
 */
export function createFakeNotificationsRepository(options: { now?: () => Date } = {}) {
  const clock = options.now ?? (() => new Date());
  const events: FakeEvent[] = [];
  const deliveries: FakeDelivery[] = [];

  const enqueue = (eventType: string, subjectType: string, subjectId: string) => {
    const event: FakeEvent = {
      id: randomUUID(),
      eventType,
      subjectType,
      subjectId,
      status: 'PENDING',
      attempts: 0,
      lastError: null,
      nextAttemptAt: new Date(0),
      lockedUntil: null,
      processedAt: null,
    };
    events.push(event);
    return event;
  };

  const find = (id: string) => {
    const event = events.find((e) => e.id === id);
    if (!event) throw new Error('unknown event');
    return event;
  };

  const repository: NotificationsRepository = {
    claimDue: ({ limit, leaseMs }) => {
      const now = clock();
      const due = events
        .filter(
          (e) =>
            e.status === 'PENDING' &&
            e.nextAttemptAt <= now &&
            (e.lockedUntil === null || e.lockedUntil < now),
        )
        .slice(0, limit);
      for (const e of due) {
        e.lockedUntil = new Date(now.getTime() + leaseMs);
        e.attempts += 1;
      }
      return Promise.resolve(
        due.map(({ id, eventType, subjectType, subjectId, attempts }) => ({
          id,
          eventType,
          subjectType,
          subjectId,
          attempts,
        })),
      );
    },
    completeEvent: (id) => {
      Object.assign(find(id), {
        status: 'PROCESSED',
        processedAt: clock(),
        lockedUntil: null,
        lastError: null,
      });
      return Promise.resolve();
    },
    retryEvent: (id, error, delayMs) => {
      Object.assign(find(id), {
        status: 'PENDING',
        lastError: error,
        nextAttemptAt: new Date(clock().getTime() + delayMs),
        lockedUntil: null,
      });
      return Promise.resolve();
    },
    failEvent: (id, error) => {
      Object.assign(find(id), { status: 'FAILED', lastError: error, lockedUntil: null });
      return Promise.resolve();
    },
    releaseEvent: (id) => {
      const event = find(id);
      event.lockedUntil = null;
      event.attempts = Math.max(0, event.attempts - 1);
      return Promise.resolve();
    },
    ensureDelivery: (key) => {
      let delivery = deliveries.find(
        (d) =>
          d.notificationEventId === key.notificationEventId &&
          d.template === key.template &&
          d.recipient === key.recipient,
      );
      if (!delivery) {
        delivery = {
          ...key,
          id: randomUUID(),
          status: 'PENDING',
          attempts: 0,
          lastError: null,
          providerMessageId: null,
        };
        deliveries.push(delivery);
      }
      return Promise.resolve({ id: delivery.id, status: delivery.status });
    },
    markDeliverySent: (id, { provider, providerMessageId }) => {
      const d = deliveries.find((x) => x.id === id)!;
      Object.assign(d, {
        status: 'SENT',
        provider,
        providerMessageId,
        lastError: null,
        attempts: d.attempts + 1,
      });
      return Promise.resolve();
    },
    markDeliveryFailed: (id, { provider, error }) => {
      const d = deliveries.find((x) => x.id === id)!;
      Object.assign(d, { status: 'FAILED', provider, lastError: error, attempts: d.attempts + 1 });
      return Promise.resolve();
    },
    listEvents: () => Promise.reject(new Error('not used')),
    requeue: () => Promise.reject(new Error('not used')),
  };

  return { repository, events, deliveries, enqueue };
}

/** Fake EmailProvider: records sends, can be told to fail, honours idempotency keys. */
export function createFakeEmailProvider() {
  const sent: SendEmailInput[] = [];
  const failures: EmailSendError[] = [];
  const seenKeys = new Map<string, string>();
  const provider: EmailProvider & {
    sent: SendEmailInput[];
    /** Queue failures for the next sends (FIFO). */
    failNext: (error: EmailSendError, times?: number) => void;
  } = {
    name: 'fake',
    sent,
    failNext(error, times = 1) {
      for (let i = 0; i < times; i++) failures.push(error);
    },
    send(input) {
      const failure = failures.shift();
      if (failure) return Promise.reject(failure);
      const existing = seenKeys.get(input.idempotencyKey);
      if (existing) return Promise.resolve({ providerMessageId: existing });
      const id = `fake_${sent.length + 1}`;
      seenKeys.set(input.idempotencyKey, id);
      sent.push(input);
      return Promise.resolve({ providerMessageId: id });
    },
  };
  return provider;
}

export function createFakeNotificationContext(data: {
  contacts?: Record<string, ContactContext>;
  applications?: Record<string, ApplicationContext>;
  meetings?: Record<string, MeetingContext>;
  webhooks?: Record<string, WebhookEventContext>;
  staff?: string[];
}): NotificationContext & { staff: string[] } {
  const staff = data.staff ?? ['staff@example.com'];
  return {
    staff,
    contactSubmission: (id) => Promise.resolve(data.contacts?.[id]),
    application: (id) => Promise.resolve(data.applications?.[id]),
    meeting: (id) => Promise.resolve(data.meetings?.[id]),
    schedulingWebhookEvent: (id) => Promise.resolve(data.webhooks?.[id]),
    staffRecipients: () => Promise.resolve([...staff]),
  };
}
