import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { App } from '../../src/app.js';
import { AppError } from '../../src/shared/errors/app-error.js';
import { buildTestApp, createLogCollector } from '../helpers/test-app.js';

interface Envelope {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: { location?: string; path?: string; message: string }[];
  };
}

/** Adds throwaway routes that exercise the error handler. */
function registerTestRoutes(app: App) {
  app.post(
    '/test/validate',
    { schema: { body: z.object({ email: z.email(), name: z.string().min(2) }) } },
    () => ({ ok: true }),
  );
  app.get('/test/app-error', () => {
    throw new AppError(409, 'CONFLICT', 'That action conflicts with the current state.', [
      { path: '/status', message: 'Already accepted' },
    ]);
  });
  app.get('/test/crash', () => {
    throw new Error('connection to db-internal:5432 failed for user admin');
  });
  app.get('/test/bad-response', { schema: { response: { 200: z.object({ id: z.uuid() }) } } }, () =>
    // Deliberately violates the response schema.
    ({ id: 'not-a-uuid' }),
  );
}

describe('error envelope', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  async function setup(env: Record<string, string> = {}, logStream?: { write(m: string): void }) {
    app = await buildTestApp(env, logStream ? { logStream } : {});
    registerTestRoutes(app);
    return app;
  }

  it('returns 404 envelope for unknown routes', async () => {
    await setup();
    const response = await app.inject({ method: 'GET', url: '/api/v1/does-not-exist' });

    expect(response.statusCode).toBe(404);
    const body = response.json<Envelope>();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('returns VALIDATION_ERROR with field paths but not submitted values', async () => {
    await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/test/validate',
      payload: { email: 'jane.private@not-an-email', name: 'J' },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<Envelope>();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('The submitted data is invalid.');
    expect(body.error.details?.map((d) => d.path).sort()).toEqual(['/email', '/name']);
    expect(body.error.details?.every((d) => d.location === 'body')).toBe(true);
    expect(response.body).not.toContain('jane.private');
  });

  it('returns BAD_REQUEST for malformed JSON without echoing the body', async () => {
    await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/test/validate',
      headers: { 'content-type': 'application/json' },
      payload: '{"email": "secret-person@example.com", ',
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<Envelope>();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(response.body).not.toContain('secret-person');
  });

  it('returns PAYLOAD_TOO_LARGE when the body exceeds BODY_LIMIT_BYTES', async () => {
    await setup({ BODY_LIMIT_BYTES: '1024' });
    const response = await app.inject({
      method: 'POST',
      url: '/test/validate',
      payload: { email: 'a@example.com', name: 'x'.repeat(2048) },
    });

    expect(response.statusCode).toBe(413);
    expect(response.json<Envelope>().error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('returns UNSUPPORTED_MEDIA_TYPE for unknown content types', async () => {
    await setup();
    const response = await app.inject({
      method: 'POST',
      url: '/test/validate',
      headers: { 'content-type': 'application/xml' },
      payload: '<a/>',
    });

    expect(response.statusCode).toBe(415);
    expect(response.json<Envelope>().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('passes AppError code, message, and details through', async () => {
    await setup();
    const response = await app.inject({ method: 'GET', url: '/test/app-error' });

    expect(response.statusCode).toBe(409);
    expect(response.json<Envelope>().error).toMatchObject({
      code: 'CONFLICT',
      message: 'That action conflicts with the current state.',
      details: [{ path: '/status', message: 'Already accepted' }],
    });
  });

  it('hides internal error details and stack traces in production', async () => {
    const logs = createLogCollector();
    await setup(
      {
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://example.com',
        EMAIL_PROVIDER: 'log',
        LOG_LEVEL: 'info',
        // Never connected to: the pool is lazy and no route here queries it.
        DATABASE_URL: 'postgres://unused:unused@127.0.0.1:1/unused',
      },
      logs.stream,
    );
    const response = await app.inject({ method: 'GET', url: '/test/crash' });

    expect(response.statusCode).toBe(500);
    const body = response.json<Envelope>();
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.message).toBe('An unexpected error occurred.');
    expect(response.body).not.toContain('db-internal');
    expect(response.body).not.toContain('stack');
    // The real cause is still logged server-side with the request ID.
    expect(logs.text).toContain('db-internal');
    expect(logs.text).toContain(body.error.requestId);
  });

  it('treats response schema violations as INTERNAL_ERROR', async () => {
    await setup();
    const response = await app.inject({ method: 'GET', url: '/test/bad-response' });

    expect(response.statusCode).toBe(500);
    expect(response.json<Envelope>().error.code).toBe('INTERNAL_ERROR');
  });
});

describe('request logging', () => {
  it('does not log request bodies or query strings', async () => {
    const logs = createLogCollector();
    const app = await buildTestApp({ LOG_LEVEL: 'info' }, { logStream: logs.stream });
    registerTestRoutes(app);

    await app.inject({
      method: 'POST',
      url: '/test/validate?token=query-secret-value',
      payload: { email: 'private.person@example.com', name: 'Private Person' },
    });
    await app.close();

    expect(logs.text).toContain('/test/validate');
    expect(logs.text).not.toContain('query-secret-value');
    expect(logs.text).not.toContain('private.person@example.com');
    expect(logs.text).not.toContain('Private Person');
  });
});

describe('router-level errors', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  it('returns the envelope for malformed URL encoding without echoing the path', async () => {
    app = await buildTestApp();
    const response = await app.inject('/api/v1/content/services/%E0%A4%A');

    expect(response.statusCode).toBe(400);
    expect(response.json<Envelope>().error.code).toBe('BAD_REQUEST');
    expect(response.json<Envelope>().error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toContain('%E0');
  });

  it('returns the envelope for over-long path params without echoing them', async () => {
    app = await buildTestApp();
    app.get('/test/:token', () => ({ ok: true }));
    const response = await app.inject(`/test/${'secret-token-'.repeat(20)}`);

    expect(response.statusCode).toBe(414);
    expect(response.json<Envelope>().error.code).toBe('BAD_REQUEST');
    expect(response.json<Envelope>().error.requestId).toBe(response.headers['x-request-id']);
    expect(response.body).not.toContain('secret-token');
  });
});
