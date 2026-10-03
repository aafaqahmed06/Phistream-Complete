import { z } from 'zod';

import { hmacSha256Hex, safeEqual } from '../../shared/security/access-tokens.js';
import {
  WebhookPayloadError,
  WebhookVerificationError,
  type BookingEvent,
  type ProviderBooking,
  type SchedulingProvider,
} from './scheduling-provider.js';

/**
 * Mock scheduling provider for local development and tests, used when no real
 * provider credentials exist. Refused in production (config validation).
 *
 * - Scheduling URLs point at `scheduling.mock.invalid` (a reserved,
 *   unresolvable domain) and carry the booking reference.
 * - Webhooks use the same trust model as real providers: `X-Mock-Signature`
 *   = hex HMAC-SHA256(MOCK_SCHEDULING_WEBHOOK_SECRET, raw body). Simulate a
 *   booking with `signMockWebhook` (see docs/scheduling.md).
 * - `getBooking` answers from bookings seen in verified webhooks.
 */

export const MOCK_PROVIDER = 'mock';
export const MOCK_SIGNATURE_HEADER = 'x-mock-signature';

const booking = z.object({
  id: z.string().min(1).max(200),
  startsAt: z.iso.datetime({ offset: true }),
  endsAt: z.iso.datetime({ offset: true }),
  meetingUrl: z.url({ protocol: /^https$/ }).nullish(),
});

const mockWebhook = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1).max(200),
    type: z.literal('BOOKING_CREATED'),
    booking,
    bookingRef: z.string().max(200).nullish(),
  }),
  z.object({
    id: z.string().min(1).max(200),
    type: z.literal('BOOKING_RESCHEDULED'),
    booking,
    previousBookingId: z.string().max(200).nullish(),
    bookingRef: z.string().max(200).nullish(),
  }),
  z.object({
    id: z.string().min(1).max(200),
    type: z.literal('BOOKING_CANCELLED'),
    bookingId: z.string().min(1).max(200),
  }),
  z.object({ id: z.string().min(1).max(200), type: z.literal('PING') }),
]);

export type MockWebhookBody = z.input<typeof mockWebhook>;

/** Signs a mock webhook body; returns the headers to send with it. */
export function signMockWebhook(secret: string, body: string): Record<string, string> {
  return {
    'content-type': 'application/json',
    [MOCK_SIGNATURE_HEADER]: hmacSha256Hex(secret, body),
  };
}

export function createMockSchedulingProvider(config: { webhookSecret: string }) {
  const bookings = new Map<string, ProviderBooking>();
  const revoked: string[] = [];

  const toBooking = (b: z.infer<typeof booking>): ProviderBooking => ({
    id: b.id,
    startsAt: new Date(b.startsAt),
    endsAt: new Date(b.endsAt),
    meetingUrl: b.meetingUrl ?? null,
    status: 'SCHEDULED',
  });

  const provider: SchedulingProvider & {
    readonly bookings: Map<string, ProviderBooking>;
    readonly revoked: readonly string[];
  } = {
    name: MOCK_PROVIDER,
    bookings,
    revoked,

    createSchedulingAccess({ bookingRef }) {
      const url = new URL('https://scheduling.mock.invalid/book');
      url.searchParams.set('ref', bookingRef);
      return Promise.resolve({ schedulingUrl: url.toString() });
    },

    revokeSchedulingAccess({ sessionId }) {
      revoked.push(sessionId);
      return Promise.resolve();
    },

    getBooking({ bookingId }) {
      return Promise.resolve(bookings.get(bookingId) ?? null);
    },

    verifyWebhook({ headers, rawBody }) {
      const header = headers[MOCK_SIGNATURE_HEADER];
      const signature = Array.isArray(header) ? header[0] : header;
      if (!signature || !safeEqual(signature, hmacSha256Hex(config.webhookSecret, rawBody))) {
        return Promise.reject(new WebhookVerificationError());
      }
      let json: unknown;
      try {
        json = JSON.parse(rawBody.toString('utf8'));
      } catch (error) {
        return Promise.reject(
          new WebhookPayloadError('webhook body is not JSON', { cause: error }),
        );
      }
      const parsed = mockWebhook.safeParse(json);
      if (!parsed.success) {
        return Promise.reject(new WebhookPayloadError('unexpected mock webhook payload'));
      }
      const body = parsed.data;
      let event: BookingEvent;
      switch (body.type) {
        case 'BOOKING_CREATED':
          event = {
            kind: 'BOOKING_CREATED',
            booking: toBooking(body.booking),
            bookingRef: body.bookingRef ?? null,
          };
          bookings.set(body.booking.id, event.booking);
          break;
        case 'BOOKING_RESCHEDULED':
          event = {
            kind: 'BOOKING_RESCHEDULED',
            booking: toBooking(body.booking),
            previousBookingId: body.previousBookingId ?? null,
            bookingRef: body.bookingRef ?? null,
          };
          bookings.set(body.booking.id, event.booking);
          break;
        case 'BOOKING_CANCELLED': {
          event = { kind: 'BOOKING_CANCELLED', bookingId: body.bookingId };
          const existing = bookings.get(body.bookingId);
          if (existing) bookings.set(body.bookingId, { ...existing, status: 'CANCELLED' });
          break;
        }
        case 'PING':
          event = { kind: 'IGNORED' };
      }
      return Promise.resolve({ eventId: body.id, eventType: body.type, event });
    },
  };
  return provider;
}
