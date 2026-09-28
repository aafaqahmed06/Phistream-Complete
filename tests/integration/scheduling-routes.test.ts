import { afterEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import {
  createSchedulingService,
  type SchedulingService,
} from '../../src/modules/scheduling/scheduling.service.js';
import type { WebhookRequest } from '../../src/providers/scheduling/scheduling-provider.js';
import { testConfig } from '../helpers/test-app.js';

const silent = { info: () => undefined, warn: () => undefined };

function capturingService() {
  const received: WebhookRequest[] = [];
  const service: SchedulingService = {
    providerName: 'mock',
    issueAccess: () => Promise.reject(new Error('unused')),
    resolveAccess: () => Promise.reject(new Error('unused')),
    lookupBooking: () => Promise.reject(new Error('unused')),
    handleWebhook: (_provider, request) => {
      received.push(request);
      return Promise.resolve({ duplicate: false, outcome: 'IGNORED' });
    },
  };
  return { service, received };
}

describe('scheduling routes', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  it('hands the adapter the exact raw bytes that were signed', async () => {
    const { service, received } = capturingService();
    app = await buildApp({ config: testConfig(), services: { scheduling: service } });
    // Unusual whitespace and key order must survive untouched.
    const raw = '{ "b":1,\n  "a" : "é" }';

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/scheduling/mock',
      headers: { 'content-type': 'application/json; charset=utf-8', 'x-mock-signature': 'sig' },
      payload: raw,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true });
    expect(received[0]?.rawBody.equals(Buffer.from(raw))).toBe(true);
    expect(received[0]?.headers['x-mock-signature']).toBe('sig');
  });

  it('keeps normal JSON parsing on every other route', async () => {
    const { service } = capturingService();
    app = await buildApp({ config: testConfig(), services: { scheduling: service } });
    app.post('/test/json', (request) => ({ echoed: request.body }));

    const response = await app.inject({ method: 'POST', url: '/test/json', payload: { a: 1 } });
    expect(response.json()).toEqual({ echoed: { a: 1 } });
  });

  it('rejects non-JSON webhook bodies with 415', async () => {
    const { service, received } = capturingService();
    app = await buildApp({ config: testConfig(), services: { scheduling: service } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/scheduling/mock',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'a=1',
    });
    expect(response.statusCode).toBe(415);
    expect(received).toEqual([]);
  });

  it('rejects oversized webhook bodies with 413', async () => {
    const { service } = capturingService();
    app = await buildApp({ config: testConfig(), services: { scheduling: service } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/scheduling/mock',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ pad: 'x'.repeat(300 * 1024) }),
    });
    expect(response.statusCode).toBe(413);
  });

  it('400s a malformed provider name', async () => {
    const { service } = capturingService();
    app = await buildApp({ config: testConfig(), services: { scheduling: service } });
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/scheduling/Cal.com',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(response.statusCode).toBe(400);
  });

  it('answers 503 everywhere when no provider is configured', async () => {
    app = await buildApp({
      config: testConfig(),
      services: {
        scheduling: createSchedulingService({
          repository: undefined,
          provider: undefined,
          tokenTtlMs: 1000,
          pageUrl: undefined,
          logger: silent,
        }),
      },
    });
    const session = await app.inject({
      method: 'GET',
      url: '/api/v1/scheduling/session',
      headers: { authorization: `Bearer ${'a'.repeat(43)}` },
    });
    const webhook = await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/scheduling/calcom',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect([session.statusCode, webhook.statusCode]).toEqual([503, 503]);
  });

  it('documents the public scheduling and webhook operations', async () => {
    const { service } = capturingService();
    app = await buildApp({ config: testConfig(), services: { scheduling: service } });
    await app.ready();
    const spec = app.swagger() as {
      paths: Record<string, Record<string, { operationId?: string; security?: unknown }>>;
      components?: { securitySchemes?: Record<string, unknown> };
    };

    expect(spec.paths['/api/v1/scheduling/session']?.get).toMatchObject({
      operationId: 'getSchedulingSession',
      security: [{ schedulingToken: [] }],
    });
    expect(spec.paths['/api/v1/webhooks/scheduling/{provider}']?.post?.operationId).toBe(
      'receiveSchedulingWebhook',
    );
    expect(spec.components?.securitySchemes).toHaveProperty('schedulingToken');
  });
});
