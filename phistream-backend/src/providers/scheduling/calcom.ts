import { createHash } from 'node:crypto';

import { z } from 'zod';

import { hmacSha256Hex, safeEqual } from '../../shared/security/access-tokens.js';
import {
  SchedulingProviderUnavailableError,
  WebhookPayloadError,
  WebhookVerificationError,
  type BookingEvent,
  type ProviderBooking,
  type SchedulingProvider,
} from './scheduling-provider.js';

/**
 * Cal.com adapter. Everything Cal.com-specific lives in this file.
 *
 * Booking access: the applicant books on the configured Cal.com event-type
 * page (CALCOM_BOOKING_URL; make the event type hidden). The URL is prefilled
 * with name/email and carries our booking reference as booking metadata
 * (`metadata[phistreamRef]=…`), which Cal.com includes in webhook payloads.
 * The page is only revealed to holders of a valid scheduling token; bookings
 * that arrive without a valid reference are not linked to any application.
 *
 * Webhooks (Settings → Developer → Webhooks, with a secret):
 * - authenticity: `X-Cal-Signature-256` = hex HMAC-SHA256(secret, raw body);
 * - body: `{ "triggerEvent": "BOOKING_CREATED", "createdAt": …, "payload": {…} }`;
 * - Cal.com sends no event id, so the event id is the SHA-256 of the raw body
 *   (a redelivery of the same event has the same bytes).
 *
 * Booking lookup uses the v2 API (`GET /v2/bookings/{uid}`) and needs
 * CALCOM_API_KEY. The key is used only here, server-side.
 *
 * These formats follow Cal.com's documentation; verify them against your
 * Cal.com account (docs/scheduling.md › Cal.com setup) before going live.
 */

export interface CalcomConfig {
  /** Public booking page of the (hidden) event type, e.g. https://cal.com/phistream/intro. */
  readonly bookingUrl: string;
  readonly webhookSecret: string;
  readonly apiKey: string | undefined;
  readonly apiBaseUrl: string;
  readonly apiVersion: string;
}

export const CALCOM_PROVIDER = 'calcom';
export const CALCOM_SIGNATURE_HEADER = 'x-cal-signature-256';
/** Booking metadata key carrying our booking reference. */
export const CALCOM_REF_METADATA_KEY = 'phistreamRef';

const bookingId = z.string().min(1).max(200);
const instant = z.iso.datetime({ offset: true });

const webhookEnvelope = z.object({
  triggerEvent: z.string().min(1).max(100),
  payload: z.record(z.string(), z.unknown()).nullish(),
});

const bookingPayload = z.object({
  uid: bookingId,
  startTime: instant,
  endTime: instant,
  metadata: z.record(z.string(), z.unknown()).nullish(),
  rescheduleUid: bookingId.nullish(),
  videoCallData: z.object({ url: z.unknown() }).partial().nullish(),
  location: z.unknown().optional(),
});

const cancelledPayload = z.object({ uid: bookingId });

function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function toBooking(payload: z.infer<typeof bookingPayload>): ProviderBooking {
  const meetingUrl =
    httpsUrl(payload.metadata?.videoCallUrl) ??
    httpsUrl(payload.videoCallData?.url) ??
    httpsUrl(payload.location);
  return {
    id: payload.uid,
    startsAt: new Date(payload.startTime),
    endsAt: new Date(payload.endTime),
    meetingUrl,
    status: 'SCHEDULED',
  };
}

function bookingRef(metadata: Record<string, unknown> | null | undefined): string | null {
  const value = metadata?.[CALCOM_REF_METADATA_KEY];
  return typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null;
}

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  // Paths only: payloads contain attendee personal data.
  if (!result.success) {
    const paths = result.error.issues.map((i) => i.path.join('.') || '(root)').join(', ');
    throw new WebhookPayloadError(`unexpected Cal.com ${what} payload (${paths})`);
  }
  return result.data;
}

const apiBooking = z.object({
  data: z.object({
    uid: bookingId,
    start: instant,
    end: instant,
    status: z.string(),
    meetingUrl: z.unknown().optional(),
    location: z.unknown().optional(),
  }),
});

export function createCalcomProvider(
  config: CalcomConfig,
  deps: { fetch?: typeof fetch; timeoutMs?: number } = {},
): SchedulingProvider {
  const doFetch = deps.fetch ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 5000;

  return {
    name: CALCOM_PROVIDER,

    createSchedulingAccess({ bookingRef: ref, attendee }) {
      const url = new URL(config.bookingUrl);
      url.searchParams.set('name', attendee.name);
      url.searchParams.set('email', attendee.email);
      url.searchParams.set(`metadata[${CALCOM_REF_METADATA_KEY}]`, ref);
      return Promise.resolve({ schedulingUrl: url.toString() });
    },

    // Access is gated by our own token and the (unchanging) event-type page;
    // there is nothing per-applicant to revoke at Cal.com.
    revokeSchedulingAccess: () => Promise.resolve(),

    async getBooking({ bookingId: id }) {
      if (!config.apiKey) {
        throw new SchedulingProviderUnavailableError('Cal.com booking lookup needs CALCOM_API_KEY');
      }
      let response: Response;
      try {
        response = await doFetch(`${config.apiBaseUrl}/bookings/${encodeURIComponent(id)}`, {
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            'cal-api-version': config.apiVersion,
            accept: 'application/json',
          },
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new SchedulingProviderUnavailableError('Cal.com API unreachable', { cause: error });
      }
      if (response.status === 404) return null;
      if (!response.ok) {
        throw new SchedulingProviderUnavailableError(`Cal.com API answered ${response.status}`);
      }
      const parsed = apiBooking.safeParse(await response.json().catch(() => undefined));
      if (!parsed.success) {
        throw new SchedulingProviderUnavailableError(
          'Cal.com API returned an unexpected booking shape',
        );
      }
      const { data } = parsed.data;
      const status = data.status.toLowerCase();
      return {
        id: data.uid,
        startsAt: new Date(data.start),
        endsAt: new Date(data.end),
        meetingUrl: httpsUrl(data.meetingUrl) ?? httpsUrl(data.location),
        status: status.includes('cancel') || status.includes('reject') ? 'CANCELLED' : 'SCHEDULED',
      };
    },

    verifyWebhook({ headers, rawBody }) {
      const header = headers[CALCOM_SIGNATURE_HEADER];
      const signature = (Array.isArray(header) ? header[0] : header)
        ?.trim()
        .replace(/^sha256=/i, '');
      if (
        !signature ||
        !safeEqual(signature.toLowerCase(), hmacSha256Hex(config.webhookSecret, rawBody))
      ) {
        return Promise.reject(new WebhookVerificationError());
      }

      let body: unknown;
      try {
        body = JSON.parse(rawBody.toString('utf8'));
      } catch (error) {
        return Promise.reject(
          new WebhookPayloadError('webhook body is not JSON', { cause: error }),
        );
      }

      try {
        const envelope = parse(webhookEnvelope, body, 'webhook');
        let event: BookingEvent;
        switch (envelope.triggerEvent) {
          case 'BOOKING_CREATED': {
            const payload = parse(bookingPayload, envelope.payload, 'booking');
            event = {
              kind: 'BOOKING_CREATED',
              booking: toBooking(payload),
              bookingRef: bookingRef(payload.metadata),
            };
            break;
          }
          case 'BOOKING_RESCHEDULED': {
            const payload = parse(bookingPayload, envelope.payload, 'booking');
            event = {
              kind: 'BOOKING_RESCHEDULED',
              booking: toBooking(payload),
              previousBookingId: payload.rescheduleUid ?? null,
              bookingRef: bookingRef(payload.metadata),
            };
            break;
          }
          case 'BOOKING_CANCELLED':
          case 'BOOKING_REJECTED': {
            const payload = parse(cancelledPayload, envelope.payload, 'booking');
            event = { kind: 'BOOKING_CANCELLED', bookingId: payload.uid };
            break;
          }
          default:
            event = { kind: 'IGNORED' };
        }
        return Promise.resolve({
          eventId: createHash('sha256').update(rawBody).digest('hex'),
          eventType: envelope.triggerEvent,
          event,
        });
      } catch (error) {
        return Promise.reject(
          error instanceof Error ? error : new WebhookPayloadError('unexpected Cal.com payload'),
        );
      }
    },
  };
}
