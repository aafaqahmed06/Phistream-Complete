import { afterEach, describe, expect, it } from 'vitest';

import type { App } from '../../src/app.js';
import { buildTestApp } from '../helpers/test-app.js';

describe('OpenAPI', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  it('documents the health endpoints and the error envelope', async () => {
    app = await buildTestApp();
    await app.ready();
    const spec = app.swagger() as {
      openapi: string;
      paths: Record<string, unknown>;
      components?: { schemas?: Record<string, unknown> };
    };

    expect(spec.openapi).toBe('3.1.0');
    // Root-level probes (/health, /health/ready) are for load balancers and hidden.
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(['/api/v1/health', '/api/v1/health/ready']),
    );
    expect(Object.keys(spec.paths)).not.toContain('/health');
    expect(spec.components?.schemas).toHaveProperty('ErrorEnvelope');
    expect(spec.components?.schemas).toHaveProperty('HealthResponse');
  });

  it('serves the spec at /docs/json when docs are enabled', async () => {
    app = await buildTestApp({ API_DOCS_ENABLED: 'true' });
    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(200);
    expect(response.json<{ info: { title: string } }>().info.title).toBe('Phistream Studio API');
  });

  it('does not expose /docs when docs are disabled', async () => {
    app = await buildTestApp({ API_DOCS_ENABLED: 'false' });
    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(response.statusCode).toBe(404);
  });
});
