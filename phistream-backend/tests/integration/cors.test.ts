import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { App } from '../../src/app.js';
import { buildTestApp } from '../helpers/test-app.js';

const ALLOWED = 'https://www.example.com';

describe('CORS', () => {
  let app: App;

  beforeAll(async () => {
    app = await buildTestApp({ CORS_ALLOWED_ORIGINS: `${ALLOWED},http://localhost:5173` });
  });
  afterAll(async () => {
    await app.close();
  });

  it('allows a configured origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: ALLOWED },
    });

    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(response.headers['access-control-expose-headers']).toContain('x-request-id');
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(response.headers.vary).toContain('Origin');
  });

  it('sends no CORS headers to an unknown origin', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://evil.example.net' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('does not treat a lookalike origin as allowed', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/health',
      headers: { origin: 'https://www.example.com.evil.net' },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight requests for a configured origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/health',
      headers: {
        origin: ALLOWED,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED);
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('Content-Type');
    expect(response.headers['access-control-max-age']).toBe('600');
  });

  it('does not grant preflight to an unknown origin', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/api/v1/health',
      headers: {
        origin: 'https://evil.example.net',
        'access-control-request-method': 'POST',
      },
    });

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
