import { createHash, createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import {
  CALCOM_SIGNATURE_HEADER,
  createCalcomProvider,
  type CalcomConfig,
} from '../../src/providers/scheduling/calcom.js';
import { createSchedulingProvider } from '../../src/providers/scheduling/index.js';
import {
  createMockSchedulingProvider,
  MOCK_SIGNATURE_HEADER,
  signMockWebhook,
} from '../../src/providers/scheduling/mock.js';
import {
  SchedulingProviderUnavailableError,
  WebhookPayloadError,
  WebhookVerificationError,
} from '../../src/providers/scheduling/scheduling-provider.js';

const SECRET = 'calcom-test-webhook-secret-123';
const CONFIG: CalcomConfig = {
  bookingUrl: 'https://cal.com/phistream-demo/intro',
  webhookSecret: SECRET,
  apiKey: 'cal_test_key',
  apiBaseUrl: 'https://api.cal.com/v2',
  apiVersion: '2024-08-13',
};

const ATTENDEE_EMAIL = 'attendee.private@example.com';

function calcomBody(triggerEvent: string, payload: Record<string, unknown> = {}) {
  return JSON.stringify({
    triggerEvent,
    createdAt: '2026-06-01T10:00:00.000Z',
    payload: {
      uid: 'booking-uid-1',
      startTime: '2026-06-10T15:00:00Z',
      endTime: '2026-06-10T15:30:00Z',
      attendees: [{ email: ATTENDEE_EMAIL, name: 'Private Person' }],
      metadata: { phistreamRef: 'ref-123', videoCallUrl: 'https://meet.example.com/abc' },
      ...payload,
    },
  });
}

function signed(body: string, secret = SECRET, header = CALCOM_SIGNATURE_HEADER) {
  return {
    headers: { [header]: createHmac('sha256', secret).update(body).digest('hex') },
    rawBody: Buffer.from(body),
  };
}

describe('Cal.com provider', () => {
  const provider = createCalcomProvider(CONFIG);

  describe('webhook verification', () => {
    it('accepts a correctly signed body and derives a stable event id from it', async () => {
      const body = calcomBody('BOOKING_CREATED');
      const verified = await provider.verifyWebhook(signed(body));

      expect(verified.eventType).toBe('BOOKING_CREATED');
      expect(verified.eventId).toBe(createHash('sha256').update(body).digest('hex'));
      expect(verified.event).toEqual({
        kind: 'BOOKING_CREATED',
        bookingRef: 'ref-123',
        booking: {
          id: 'booking-uid-1',
          startsAt: new Date('2026-06-10T15:00:00Z'),
          endsAt: new Date('2026-06-10T15:30:00Z'),
          meetingUrl: 'https://meet.example.com/abc',
          status: 'SCHEDULED',
        },
      });
    });

    it('accepts an upper-case or "sha256="-prefixed signature', async () => {
      const body = calcomBody('BOOKING_CREATED');
      const hex = createHmac('sha256', SECRET).update(body).digest('hex');
      for (const value of [hex.toUpperCase(), `sha256=${hex}`]) {
        await expect(
          provider.verifyWebhook({
            headers: { [CALCOM_SIGNATURE_HEADER]: value },
            rawBody: Buffer.from(body),
          }),
        ).resolves.toBeDefined();
      }
    });

    it.each([
      ['missing', () => ({ headers: {}, rawBody: Buffer.from(calcomBody('BOOKING_CREATED')) })],
      ['wrong secret', () => signed(calcomBody('BOOKING_CREATED'), 'another-secret-value-123')],
      [
        'tampered body',
        () => {
          const request = signed(calcomBody('BOOKING_CREATED'));
          return {
            ...request,
            rawBody: Buffer.from(calcomBody('BOOKING_CREATED', { uid: 'evil' })),
          };
        },
      ],
      [
        're-serialized body (whitespace change)',
        () => {
          const body = calcomBody('BOOKING_CREATED');
          return {
            ...signed(body),
            rawBody: Buffer.from(JSON.stringify(JSON.parse(body), null, 2)),
          };
        },
      ],
      [
        'signature in the wrong header',
        () => signed(calcomBody('BOOKING_CREATED'), SECRET, 'x-signature'),
      ],
      [
        'empty signature',
        () => ({ headers: { [CALCOM_SIGNATURE_HEADER]: '' }, rawBody: Buffer.from('{}') }),
      ],
    ])('rejects a %s signature before parsing', async (_, request) => {
      await expect(provider.verifyWebhook(request())).rejects.toBeInstanceOf(
        WebhookVerificationError,
      );
    });

    it('verifies before parsing: an unsigned non-JSON body is a signature error', async () => {
      await expect(
        provider.verifyWebhook({ headers: {}, rawBody: Buffer.from('not json') }),
      ).rejects.toBeInstanceOf(WebhookVerificationError);
    });
  });

  describe('payload mapping', () => {
    it('maps a reschedule with the previous booking uid', async () => {
      const verified = await provider.verifyWebhook(
        signed(
          calcomBody('BOOKING_RESCHEDULED', {
            uid: 'booking-uid-2',
            rescheduleUid: 'booking-uid-1',
          }),
        ),
      );
      expect(verified.event).toMatchObject({
        kind: 'BOOKING_RESCHEDULED',
        previousBookingId: 'booking-uid-1',
        bookingRef: 'ref-123',
        booking: { id: 'booking-uid-2' },
      });
    });

    it.each(['BOOKING_CANCELLED', 'BOOKING_REJECTED'])(
      'maps %s to a cancellation',
      async (trigger) => {
        const verified = await provider.verifyWebhook(signed(calcomBody(trigger)));
        expect(verified.event).toEqual({ kind: 'BOOKING_CANCELLED', bookingId: 'booking-uid-1' });
      },
    );

    it.each(['PING', 'MEETING_ENDED', 'BOOKING_PAID', 'FORM_SUBMITTED'])(
      'ignores %s',
      async (trigger) => {
        const body = JSON.stringify({ triggerEvent: trigger, payload: {} });
        expect((await provider.verifyWebhook(signed(body))).event).toEqual({ kind: 'IGNORED' });
      },
    );

    it('takes the first https meeting URL and never a non-https one', async () => {
      const fromVideoCall = await provider.verifyWebhook(
        signed(
          calcomBody('BOOKING_CREATED', {
            metadata: { phistreamRef: 'r' },
            videoCallData: { url: 'https://zoom.example.com/j/1' },
          }),
        ),
      );
      expect(fromVideoCall.event).toMatchObject({
        booking: { meetingUrl: 'https://zoom.example.com/j/1' },
      });

      const insecure = await provider.verifyWebhook(
        signed(
          calcomBody('BOOKING_CREATED', {
            metadata: { videoCallUrl: 'http://meet.example.com/x' },
            location: 'Office',
          }),
        ),
      );
      expect(insecure.event).toMatchObject({ booking: { meetingUrl: null }, bookingRef: null });
    });

    it.each([
      ['a missing uid', { uid: undefined }],
      ['a bad start time', { startTime: 'tomorrow' }],
      ['a numeric uid', { uid: 42 }],
    ])('rejects a signed booking with %s (without echoing attendee data)', async (_, change) => {
      const error = await provider
        .verifyWebhook(signed(calcomBody('BOOKING_CREATED', change)))
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(WebhookPayloadError);
      expect(String(error)).not.toContain(ATTENDEE_EMAIL);
    });

    it('rejects a signed body that is not JSON', async () => {
      await expect(provider.verifyWebhook(signed('not json'))).rejects.toBeInstanceOf(
        WebhookPayloadError,
      );
    });
  });

  describe('scheduling access', () => {
    it('prefills the booking page and passes the booking reference as metadata', async () => {
      const { schedulingUrl } = await provider.createSchedulingAccess({
        sessionId: 's1',
        bookingRef: 'ref-abc',
        attendee: { name: 'Jane Doe', email: 'jane@example.com' },
      });
      const url = new URL(schedulingUrl);

      expect(url.origin + url.pathname).toBe(CONFIG.bookingUrl);
      expect(url.searchParams.get('name')).toBe('Jane Doe');
      expect(url.searchParams.get('email')).toBe('jane@example.com');
      expect(url.searchParams.get('metadata[phistreamRef]')).toBe('ref-abc');
      // Never a provider secret.
      expect(schedulingUrl).not.toContain(CONFIG.apiKey);
      expect(schedulingUrl).not.toContain(SECRET);
    });
  });

  describe('booking lookup', () => {
    const response = (status: number, body: unknown) =>
      Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        }),
      );

    it('calls the v2 API with the key and version headers and maps the booking', async () => {
      const fetch = vi.fn(() =>
        response(200, {
          status: 'success',
          data: {
            uid: 'uid/1',
            start: '2026-06-10T15:00:00.000Z',
            end: '2026-06-10T15:30:00.000Z',
            status: 'accepted',
            meetingUrl: 'https://meet.example.com/abc',
          },
        }),
      );
      const booking = await createCalcomProvider(CONFIG, { fetch }).getBooking({
        bookingId: 'uid/1',
      });

      expect(booking).toEqual({
        id: 'uid/1',
        startsAt: new Date('2026-06-10T15:00:00.000Z'),
        endsAt: new Date('2026-06-10T15:30:00.000Z'),
        meetingUrl: 'https://meet.example.com/abc',
        status: 'SCHEDULED',
      });
      const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe('https://api.cal.com/v2/bookings/uid%2F1');
      expect(init.headers).toMatchObject({
        authorization: 'Bearer cal_test_key',
        'cal-api-version': '2024-08-13',
      });
    });

    it('maps cancelled bookings', async () => {
      const fetch = () =>
        response(200, {
          data: {
            uid: 'u',
            start: '2026-06-10T15:00:00Z',
            end: '2026-06-10T15:30:00Z',
            status: 'cancelled',
          },
        });
      expect(
        (await createCalcomProvider(CONFIG, { fetch }).getBooking({ bookingId: 'u' }))?.status,
      ).toBe('CANCELLED');
    });

    it('returns null for an unknown booking', async () => {
      const fetch = () => response(404, { status: 'error' });
      expect(
        await createCalcomProvider(CONFIG, { fetch }).getBooking({ bookingId: 'u' }),
      ).toBeNull();
    });

    it.each([
      ['a server error', () => response(500, {})],
      ['an auth error', () => response(401, {})],
      ['a network failure', () => Promise.reject(new TypeError('fetch failed'))],
      ['an unexpected shape', () => response(200, { data: { id: 1 } })],
    ])('reports %s as provider unavailable', async (_, fetch) => {
      await expect(
        createCalcomProvider(CONFIG, { fetch }).getBooking({ bookingId: 'u' }),
      ).rejects.toBeInstanceOf(SchedulingProviderUnavailableError);
    });

    it('needs an API key', async () => {
      await expect(
        createCalcomProvider({ ...CONFIG, apiKey: undefined }).getBooking({ bookingId: 'u' }),
      ).rejects.toBeInstanceOf(SchedulingProviderUnavailableError);
    });
  });
});

describe('mock provider', () => {
  const secret = 'mock-webhook-secret-12345';

  it('verifies signed mock webhooks and remembers bookings for lookup', async () => {
    const provider = createMockSchedulingProvider({ webhookSecret: secret });
    const body = JSON.stringify({
      id: 'evt-1',
      type: 'BOOKING_CREATED',
      booking: { id: 'b1', startsAt: '2026-06-10T15:00:00Z', endsAt: '2026-06-10T15:30:00Z' },
      bookingRef: 'ref',
    });
    const verified = await provider.verifyWebhook({
      headers: signMockWebhook(secret, body),
      rawBody: Buffer.from(body),
    });

    expect(verified).toMatchObject({
      eventId: 'evt-1',
      event: { kind: 'BOOKING_CREATED', bookingRef: 'ref' },
    });
    expect(await provider.getBooking({ bookingId: 'b1' })).toMatchObject({
      id: 'b1',
      status: 'SCHEDULED',
    });
  });

  it('rejects unsigned or wrongly signed mock webhooks', async () => {
    const provider = createMockSchedulingProvider({ webhookSecret: secret });
    await expect(
      provider.verifyWebhook({
        headers: { [MOCK_SIGNATURE_HEADER]: 'nope' },
        rawBody: Buffer.from('{}'),
      }),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('builds unresolvable scheduling URLs', async () => {
    const provider = createMockSchedulingProvider({ webhookSecret: secret });
    const { schedulingUrl } = await provider.createSchedulingAccess({
      sessionId: 's',
      bookingRef: 'ref',
      attendee: { name: 'n', email: 'e@example.com' },
    });
    expect(new URL(schedulingUrl).hostname).toBe('scheduling.mock.invalid');
  });
});

describe('scheduling configuration', () => {
  const base = { NODE_ENV: 'test' };

  it('is disabled by default', () => {
    expect(loadConfig(base).scheduling).toEqual({
      provider: undefined,
      tokenTtlMs: 72 * 3_600_000,
      pageUrl: undefined,
    });
    expect(createSchedulingProvider(undefined)).toBeUndefined();
  });

  it('builds the Cal.com provider with API defaults', () => {
    const config = loadConfig({
      ...base,
      SCHEDULING_PROVIDER: 'calcom',
      CALCOM_BOOKING_URL: 'https://cal.com/phistream/intro/',
      CALCOM_WEBHOOK_SECRET: 'x'.repeat(20),
    }).scheduling.provider;
    expect(config).toEqual({
      kind: 'calcom',
      bookingUrl: 'https://cal.com/phistream/intro',
      webhookSecret: 'x'.repeat(20),
      apiKey: undefined,
      apiBaseUrl: 'https://api.cal.com/v2',
      apiVersion: '2024-08-13',
    });
    expect(createSchedulingProvider(config)?.name).toBe('calcom');
  });

  it.each([
    [{ SCHEDULING_PROVIDER: 'calcom' }, 'CALCOM_BOOKING_URL'],
    [
      { SCHEDULING_PROVIDER: 'calcom', CALCOM_BOOKING_URL: 'https://cal.com/x' },
      'CALCOM_WEBHOOK_SECRET',
    ],
    [
      {
        SCHEDULING_PROVIDER: 'calcom',
        CALCOM_BOOKING_URL: 'https://cal.com/x',
        CALCOM_WEBHOOK_SECRET: 'short',
      },
      'CALCOM_WEBHOOK_SECRET',
    ],
    [{ SCHEDULING_PROVIDER: 'mock' }, 'MOCK_SCHEDULING_WEBHOOK_SECRET'],
    [{ SCHEDULING_PROVIDER: 'zoom' }, 'SCHEDULING_PROVIDER'],
    [{ SCHEDULING_TOKEN_TTL_HOURS: '0' }, 'SCHEDULING_TOKEN_TTL_HOURS'],
  ])('rejects %j', (env, variable) => {
    expect(() => loadConfig({ ...base, ...env })).toThrow(variable);
  });

  it('refuses the mock provider and plain-http URLs in production', () => {
    const production = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://u:p@db.example.com/app',
      CORS_ALLOWED_ORIGINS: 'https://example.com',
    };
    expect(() =>
      loadConfig({
        ...production,
        SCHEDULING_PROVIDER: 'mock',
        MOCK_SCHEDULING_WEBHOOK_SECRET: 'x'.repeat(20),
      }),
    ).toThrow('mock provider is not allowed in production');
    expect(() =>
      loadConfig({
        ...production,
        SCHEDULING_PROVIDER: 'calcom',
        CALCOM_BOOKING_URL: 'http://cal.com/x',
        CALCOM_WEBHOOK_SECRET: 'x'.repeat(20),
      }),
    ).toThrow('CALCOM_BOOKING_URL');
  });

  it('never echoes secrets in configuration errors', () => {
    try {
      loadConfig({
        ...base,
        SCHEDULING_PROVIDER: 'calcom',
        CALCOM_BOOKING_URL: 'https://cal.com/x',
        CALCOM_WEBHOOK_SECRET: 'tiny-secret',
      });
    } catch (error) {
      expect(String(error)).not.toContain('tiny-secret');
    }
  });
});
