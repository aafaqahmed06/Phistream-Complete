import { afterEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { NewAnalyticsEvent } from '../../src/modules/analytics/analytics.repository.js';
import {
  CLIENT_ANALYTICS_EVENTS,
  SERVER_ONLY_ANALYTICS_EVENTS,
} from '../../src/modules/analytics/analytics.schemas.js';
import { createAnalyticsService } from '../../src/modules/analytics/analytics.service.js';
import { createLogCollector, testConfig } from '../helpers/test-app.js';

const SESSION = 'sess_0123456789abcdef';

function analyticsApp(env: Record<string, string> = {}, logStream?: { write(m: string): void }) {
  const stored: NewAnalyticsEvent[] = [];
  const service = createAnalyticsService({
    repository: {
      currentTime: () => Promise.resolve(new Date()),
      insertEvent: (event) => {
        stored.push(event);
        return Promise.resolve();
      },
      clientStageCounts: () => Promise.reject(new Error('unused')),
      applicationCohort: () => Promise.reject(new Error('unused')),
      clientBySource: () => Promise.reject(new Error('unused')),
      cohortBySource: () => Promise.reject(new Error('unused')),
    },
  });
  const appPromise = buildApp({
    config: testConfig(env),
    services: { analytics: service },
    ...(logStream ? { logStream } : {}),
  });
  return { appPromise, stored };
}

describe('POST /api/v1/analytics/events', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  const post = (payload: unknown, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/analytics/events',
      headers: { 'content-type': 'application/json', ...headers },
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
    });

  describe('event allowlist', () => {
    it.each(CLIENT_ANALYTICS_EVENTS)('accepts the client event %s', async (event) => {
      const ctx = analyticsApp();
      app = await ctx.appPromise;
      const response = await post({ event, anonymousSessionId: SESSION });

      expect(response.statusCode).toBe(202);
      expect(response.json()).toEqual({ data: { status: 'RECORDED' } });
      expect(ctx.stored.map((e) => e.eventName)).toEqual([event]);
    });

    it('covers every server-only event name in the database list', () => {
      expect(SERVER_ONLY_ANALYTICS_EVENTS).toEqual([
        'application_accepted',
        'application_rejected',
        'meeting_booked',
      ]);
    });

    it.each([
      ...SERVER_ONLY_ANALYTICS_EVENTS,
      'revenue_booked',
      'purchase',
      'APPLICATION_SUBMIT',
      '',
      'vsl_100',
    ])('rejects %j (not reportable by the browser) and stores nothing', async (event) => {
      const ctx = analyticsApp();
      app = await ctx.appPromise;
      const response = await post({ event, anonymousSessionId: SESSION });

      expect(response.statusCode).toBe(400);
      expect(
        response.json<{ error: { details: { path: string }[] } }>().error.details[0]?.path,
      ).toBe('/event');
      expect(ctx.stored).toEqual([]);
    });
  });

  describe('data minimization', () => {
    it('stores only the allowed fields, with the path and referrer reduced', async () => {
      const ctx = analyticsApp();
      app = await ctx.appPromise;
      const response = await post({
        event: 'onboarding_view',
        anonymousSessionId: SESSION,
        source: 'Instagram',
        campaign: 'BIO',
        path: '/onboarding?email=jane@example.com&utm_source=instagram#token=secret',
        referrer: 'https://l.instagram.com/?u=https%3A%2F%2Fphistream.example%2F&e=private',
      });

      expect(response.statusCode).toBe(202);
      expect(ctx.stored).toEqual([
        {
          eventName: 'onboarding_view',
          anonymousSessionId: SESSION,
          source: 'instagram',
          campaign: 'bio',
          path: '/onboarding',
          referrer: 'https://l.instagram.com',
        },
      ]);
      expect(JSON.stringify(ctx.stored)).not.toContain('jane@example.com');
      expect(JSON.stringify(ctx.stored)).not.toContain('secret');
    });

    it('stores nulls for omitted or blank optional fields', async () => {
      const ctx = analyticsApp();
      app = await ctx.appPromise;
      await post({ event: 'vsl_start', anonymousSessionId: SESSION, source: '', referrer: '' });
      expect(ctx.stored[0]).toEqual({
        eventName: 'vsl_start',
        anonymousSessionId: SESSION,
        source: null,
        campaign: null,
        path: null,
        referrer: null,
      });
    });

    it.each([
      ['arbitrary metadata', { metadata: { email: 'x@example.com' } }, '/'],
      [
        'a client-supplied application id',
        { applicationId: '00000000-0000-4000-8000-000000000001' },
        '/',
      ],
      ['an IP address', { ip: '203.0.113.1' }, '/'],
      ['a user agent', { userAgent: 'Mozilla/5.0' }, '/'],
    ])('rejects %s (unknown fields are refused)', async (_, extra, path) => {
      const ctx = analyticsApp();
      app = await ctx.appPromise;
      const response = await post({ event: 'vsl_start', anonymousSessionId: SESSION, ...extra });
      expect(response.statusCode).toBe(400);
      expect(
        response.json<{ error: { details: { path: string }[] } }>().error.details[0]?.path,
      ).toBe(path);
      expect(ctx.stored).toEqual([]);
    });

    it.each([
      ['a short session id', { anonymousSessionId: 'short' }, '/anonymousSessionId'],
      ['an email as session id', { anonymousSessionId: 'jane@example.com' }, '/anonymousSessionId'],
      ['a relative path', { path: 'onboarding' }, '/path'],
      ['a protocol-relative path', { path: '//evil.example/x' }, '/path'],
      ['a control character in the path', { path: '/a\u0000b' }, '/path'],
      ['a non-URL referrer', { referrer: 'instagram' }, '/referrer'],
      ['a javascript: referrer', { referrer: 'javascript:alert(1)' }, '/referrer'],
      ['a malformed source', { source: '<script>' }, '/source'],
    ])('rejects %s', async (_, extra, path) => {
      app = await analyticsApp().appPromise;
      const response = await post({ event: 'vsl_start', anonymousSessionId: SESSION, ...extra });
      expect(response.statusCode).toBe(400);
      expect(
        response
          .json<{ error: { details: { path: string }[] } }>()
          .error.details.map((d) => d.path),
      ).toContain(path);
    });

    it('never logs event contents', async () => {
      const logs = createLogCollector();
      app = await analyticsApp({ LOG_LEVEL: 'trace' }, logs.stream).appPromise;
      await post({
        event: 'onboarding_view',
        anonymousSessionId: 'sess_LOGMARKER_123',
        path: '/onboarding-marker',
        source: 'marker-source',
      });

      expect(logs.text).toContain('"statusCode":202');
      for (const value of ['sess_LOGMARKER_123', 'onboarding-marker', 'marker-source']) {
        expect(logs.text).not.toContain(value);
      }
    });
  });

  describe('transport', () => {
    it('accepts text/plain JSON bodies (navigator.sendBeacon)', async () => {
      const ctx = analyticsApp();
      app = await ctx.appPromise;
      const response = await post(
        JSON.stringify({ event: 'vsl_50', anonymousSessionId: SESSION }),
        {
          'content-type': 'text/plain;charset=UTF-8',
        },
      );
      expect(response.statusCode).toBe(202);
      expect(ctx.stored[0]?.eventName).toBe('vsl_50');
    });

    it('400s invalid text/plain JSON without echoing it', async () => {
      app = await analyticsApp().appPromise;
      const response = await post('{"event": "vsl_50", PRIVATE', { 'content-type': 'text/plain' });
      expect(response.statusCode).toBe(400);
      expect(response.body).not.toContain('PRIVATE');
    });

    it('keeps text/plain handling scoped to this route', async () => {
      app = await analyticsApp().appPromise;
      app.post('/test/plain', (request) => ({ type: typeof request.body }));
      const response = await app.inject({
        method: 'POST',
        url: '/test/plain',
        headers: { 'content-type': 'text/plain' },
        payload: '{"a":1}',
      });
      expect(response.json()).toEqual({ type: 'string' });
    });

    it('rejects oversized bodies', async () => {
      app = await analyticsApp().appPromise;
      const response = await post({
        event: 'vsl_start',
        anonymousSessionId: SESSION,
        path: `/${'a'.repeat(5000)}`,
      });
      expect(response.statusCode).toBe(413);
    });

    it('rate-limits per IP with its own counter', async () => {
      app = await analyticsApp({ ANALYTICS_RATE_LIMIT_MAX: '2' }).appPromise;
      await post({ event: 'vsl_start', anonymousSessionId: SESSION });
      await post({ event: 'vsl_25', anonymousSessionId: SESSION });
      const limited = await post({ event: 'vsl_50', anonymousSessionId: SESSION });
      expect(limited.statusCode).toBe(429);
    });

    it('defaults to 120 events per minute per IP', () => {
      expect(testConfig().analytics.rateLimit).toEqual({ max: 120, windowMs: 60_000 });
    });
  });

  it('is documented in OpenAPI', async () => {
    app = await analyticsApp().appPromise;
    await app.ready();
    const spec = app.swagger() as {
      paths: Record<string, Record<string, { operationId?: string; tags?: string[] }>>;
    };
    expect(spec.paths['/api/v1/analytics/events']?.post).toMatchObject({
      operationId: 'recordAnalyticsEvent',
      tags: ['analytics'],
    });
  });
});
