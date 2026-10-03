import { afterEach, describe, expect, it } from 'vitest';

import type { App } from '../../src/app.js';
import { buildTestApp } from '../helpers/test-app.js';

const PRODUCTION = {
  NODE_ENV: 'production',
  CORS_ALLOWED_ORIGINS: 'https://example.com',
  EMAIL_PROVIDER: 'log',
  // Never connected to: nothing here queries the database.
  DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
};

describe('hardening', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  describe('security headers', () => {
    const expectApiHeaders = (headers: Record<string, unknown>) => {
      expect(headers).toMatchObject({
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
        'x-frame-options': 'DENY',
        'cross-origin-resource-policy': 'same-origin',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
      });
    };

    it('are sent on success, not-found, validation, and rate-limit responses', async () => {
      app = await buildTestApp({ RATE_LIMIT_MAX: '1' });
      expectApiHeaders((await app.inject('/api/v1/health')).headers);
      expectApiHeaders((await app.inject('/api/v1/nope')).headers);
      const limited = await app.inject('/api/v1/nope-again');
      expect(limited.statusCode).toBe(429);
      expectApiHeaders(limited.headers);
    });

    it('send HSTS only in production', async () => {
      app = await buildTestApp();
      expect(
        (await app.inject('/api/v1/health')).headers['strict-transport-security'],
      ).toBeUndefined();
      await app.close();

      app = await buildTestApp(PRODUCTION);
      expect((await app.inject('/api/v1/health')).headers['strict-transport-security']).toBe(
        'max-age=31536000; includeSubDomains',
      );
    });

    it('exempt the Swagger UI from the API content security policy', async () => {
      app = await buildTestApp({ API_DOCS_ENABLED: 'true' });
      const docs = await app.inject('/docs/');
      expect(docs.statusCode).toBe(200);
      expect(docs.headers['content-security-policy']).toBeUndefined();
      expect(docs.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  it('bounds how long a request may take to arrive', async () => {
    app = await buildTestApp({ REQUEST_TIMEOUT_MS: '15000' });
    expect(app.server.requestTimeout).toBe(15_000);
    await app.close();
    app = await buildTestApp();
    expect(app.server.requestTimeout).toBe(30_000);
  });

  it('never exposes the API docs in production by default', async () => {
    app = await buildTestApp(PRODUCTION);
    expect((await app.inject('/docs/json')).statusCode).toBe(404);
  });
});
