import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { Database } from '../../src/db/client.js';
import { healthRoutes } from '../../src/modules/health/health.routes.js';
import { buildTestApp, testConfig } from '../helpers/test-app.js';

describe('health endpoints', () => {
  let app: App;

  beforeAll(async () => {
    app = await buildTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it.each(['/health', '/api/v1/health'])('GET %s returns ok', async (url) => {
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    const body = response.json<{ status: string; timestamp: string }>();
    expect(body.status).toBe('ok');
    expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
  });

  it('returns a generated x-request-id header', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes a safe incoming x-request-id', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'frontend-req-12345' },
    });
    expect(response.headers['x-request-id']).toBe('frontend-req-12345');
  });

  it('supports HEAD for health checks', async () => {
    const response = await app.inject({ method: 'HEAD', url: '/health' });
    expect(response.statusCode).toBe(200);
  });
});

describe('readiness endpoint', () => {
  function stubDatabase(ping: () => Promise<void>): Database {
    return { db: {} as Database['db'], ping, close: () => Promise.resolve() };
  }

  it.each(['/health/ready', '/api/v1/health/ready'])(
    'GET %s returns ok when the database responds',
    async (url) => {
      const app = await buildApp({
        config: testConfig(),
        database: stubDatabase(() => Promise.resolve()),
      });
      const response = await app.inject({ method: 'GET', url });
      await app.close();

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ status: 'ok', checks: { database: 'ok' } });
    },
  );

  it('returns 503 without leaking the database error', async () => {
    const app = await buildApp({
      config: testConfig(),
      database: stubDatabase(() =>
        Promise.reject(new Error('connect ECONNREFUSED db-internal:5432')),
      ),
    });
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    await app.close();

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body).not.toContain('db-internal');
  });

  it('returns 503 when the database does not answer in time', async () => {
    const slow = await buildTestApp();
    // Register an extra copy with a short timeout to keep the test fast.
    await slow.register(healthRoutes, {
      prefix: '/fast',
      database: { ping: () => new Promise<void>(() => undefined) },
      readinessTimeoutMs: 50,
    });
    const response = await slow.inject({ method: 'GET', url: '/fast/health/ready' });
    await slow.close();

    expect(response.statusCode).toBe(503);
  });

  it('returns 503 when no database is configured', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/health/ready' });
    await app.close();

    expect(response.statusCode).toBe(503);
  });

  it('closes the database when the app closes', async () => {
    let closed = 0;
    const app = await buildApp({
      config: testConfig(),
      database: {
        db: {} as Database['db'],
        ping: () => Promise.resolve(),
        close: () => {
          closed++;
          return Promise.resolve();
        },
      },
    });
    await app.ready();
    await app.close();

    expect(closed).toBe(1);
  });
});
