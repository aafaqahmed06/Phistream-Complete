import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { App } from '../../src/app.js';
import { buildTestApp } from '../helpers/test-app.js';

describe('rate limiting', () => {
  let app: App;

  beforeEach(async () => {
    app = await buildTestApp({ RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' });
    app.get('/test/limited', () => ({ ok: true }));
  });
  afterEach(async () => {
    await app.close();
  });

  it('returns RATE_LIMITED envelope with retry headers after the limit', async () => {
    const first = await app.inject({ method: 'GET', url: '/test/limited' });
    await app.inject({ method: 'GET', url: '/test/limited' });
    const limited = await app.inject({ method: 'GET', url: '/test/limited' });

    expect(first.statusCode).toBe(200);
    expect(first.headers['x-ratelimit-limit']).toBe('2');

    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    const body = limited.json<{ error: { code: string; requestId: string } }>();
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.requestId).toBe(limited.headers['x-request-id']);
  });

  it('rate-limits unknown routes to slow down scanning', async () => {
    await app.inject({ method: 'GET', url: '/scan/1' });
    await app.inject({ method: 'GET', url: '/scan/2' });
    const limited = await app.inject({ method: 'GET', url: '/scan/3' });

    expect(limited.statusCode).toBe(429);
  });

  it('never rate-limits health checks', async () => {
    for (let i = 0; i < 5; i++) {
      const response = await app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
    }
  });

  it('tracks clients separately by IP', async () => {
    const ip = (remoteAddress: string) =>
      app.inject({ method: 'GET', url: '/test/limited', remoteAddress });

    await ip('203.0.113.1');
    await ip('203.0.113.1');
    expect((await ip('203.0.113.1')).statusCode).toBe(429);
    expect((await ip('203.0.113.2')).statusCode).toBe(200);
  });

  it('ignores spoofed X-Forwarded-For when TRUST_PROXY is disabled', async () => {
    const spoofed = (forwardedFor: string) =>
      app.inject({
        method: 'GET',
        url: '/test/limited',
        headers: { 'x-forwarded-for': forwardedFor },
      });

    await spoofed('198.51.100.1');
    await spoofed('198.51.100.2');
    expect((await spoofed('198.51.100.3')).statusCode).toBe(429);
  });
});
