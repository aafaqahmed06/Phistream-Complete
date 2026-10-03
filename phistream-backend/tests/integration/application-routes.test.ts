import { afterEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import { createApplicationsService } from '../../src/modules/applications/applications.service.js';
import { createPublicFormSpamGuard } from '../../src/shared/anti-spam/checks.js';
import { createFakeApplicationsRepository, TEST_ANSWERS } from '../helpers/fake-applications.js';
import { buildTestApp, createLogCollector, testConfig } from '../helpers/test-app.js';

interface Envelope {
  error: { code: string; details?: { path?: string; location?: string }[] };
}

interface Created {
  data: {
    application: { id: string; reference: string };
    nextStep: string;
    statusAccess: { token: string; expiresAt: string };
  };
}

const PII = {
  name: 'Quentin Marker-Applicant',
  email: 'quentin.marker@example.com',
  phone: '+1 555 0142',
  companyName: 'Marker Media Unique',
  secretAnswer: 'CONFIDENTIAL-ANSWER-MARKER',
};

const validBody = (overrides: Record<string, unknown> = {}) => ({
  formVersion: 'v1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  answers: TEST_ANSWERS,
  ...overrides,
});

function applicationsApp(
  options: {
    env?: Record<string, string>;
    form?: { version: string; definition: unknown } | undefined;
    logStream?: { write(message: string): void };
  } = {},
) {
  const fake = createFakeApplicationsRepository({
    ...('form' in options ? { form: options.form } : {}),
    tiers: { growth: { id: '00000000-0000-4000-8000-000000000101', isActive: true } },
  });
  const config = testConfig(options.env);
  const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
  const service = createApplicationsService({
    repository: fake.repository,
    spamGuard: createPublicFormSpamGuard({ logger: silent }),
    logger: silent,
    policy: { statusTokenTtlMs: config.applications.statusTokenTtlMs },
  });
  const appPromise = buildApp({
    config,
    services: { applications: service },
    ...(options.logStream ? { logStream: options.logStream } : {}),
  });
  return { appPromise, ...fake };
}

describe('applications routes', () => {
  let app: App;

  afterEach(async () => {
    await app.close();
  });

  const submit = (payload: unknown, extra: { remoteAddress?: string } = {}) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/applications',
      payload: payload as object,
      ...extra,
    });

  const status = (id: string, authorization?: string) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/applications/${id}/status`,
      headers: authorization === undefined ? {} : { authorization },
    });

  describe('GET /api/v1/applications/form', () => {
    it('returns the active version and its normalized questions', async () => {
      app = await applicationsApp().appPromise;
      const response = await app.inject('/api/v1/applications/form');

      expect(response.statusCode).toBe(200);
      const { data } = response.json<{
        data: { version: string; title: string; questions: { key: string; required: boolean }[] };
      }>();
      expect(data.version).toBe('v1');
      expect(data.title).toBe('Test form');
      expect(data.questions.map((q) => q.key)).toEqual([
        'about',
        'followers',
        'platform',
        'goals',
        'agree',
        'portfolio',
      ]);
      expect(response.headers['cache-control']).toBe('public, max-age=60');
    });

    it('returns 404 when no form is published', async () => {
      app = await applicationsApp({ form: undefined }).appPromise;
      const response = await app.inject('/api/v1/applications/form');

      expect(response.statusCode).toBe(404);
      expect(response.headers['cache-control']).toBeUndefined();
    });
  });

  describe('POST /api/v1/applications', () => {
    it('returns 201 with id, reference, next step and a status token', async () => {
      const ctx = applicationsApp();
      app = await ctx.appPromise;

      const response = await submit(
        validBody({ email: ' Jane@Example.COM ', serviceTierSlug: 'growth', source: 'Instagram' }),
      );

      expect(response.statusCode).toBe(201);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = response.json<Created>();
      expect(body.data.nextStep).toBe('UNDER_REVIEW');
      expect(body.data.application.id).toBe(ctx.state.applications[0]?.id);
      expect(body.data.application.reference).toMatch(/^PHI-\d{4}-[0-9A-Z]{6}$/);
      expect(body.data.statusAccess.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(new Date(body.data.statusAccess.expiresAt).getTime()).toBeGreaterThan(Date.now());
      expect(ctx.state.leads[0]).toMatchObject({ email: 'jane@example.com', source: 'instagram' });
      // Never internal state.
      expect(Object.keys(body.data).sort()).toEqual(['application', 'nextStep', 'statusAccess']);
    });

    it.each([
      ['missing formVersion', { formVersion: undefined }, '/formVersion'],
      ['bad formVersion', { formVersion: '../etc' }, '/formVersion'],
      ['invalid email', { email: 'nope' }, '/email'],
      ['bad tier slug', { serviceTierSlug: 'Growth Plan' }, '/serviceTierSlug'],
      ['answers not an object', { answers: ['a'] }, '/answers'],
      ['bad answer key', { answers: { 'Bad Key': 1 } }, '/answers/Bad Key'],
      ['oversized name', { name: 'x'.repeat(201) }, '/name'],
    ])('400s %s', async (_, override, path) => {
      app = await applicationsApp().appPromise;
      const response = await submit(validBody(override));

      expect(response.statusCode).toBe(400);
      const body = response.json<Envelope>();
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.details?.map((d) => d.path)).toContain(path);
    });

    it('400s invalid answers with /answers/<key> paths and never echoes values', async () => {
      app = await applicationsApp().appPromise;
      const response = await submit(
        validBody({ answers: { ...TEST_ANSWERS, platform: 'secret-value-marker', surprise: 1 } }),
      );

      expect(response.statusCode).toBe(400);
      const body = response.json<Envelope>();
      expect(body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ location: 'body', path: '/answers/platform' }),
          expect.objectContaining({ location: 'body', path: '/answers' }),
        ]),
      );
      expect(response.body).not.toContain('secret-value-marker');
    });

    it('400s an unavailable service tier', async () => {
      app = await applicationsApp().appPromise;
      const response = await submit(validBody({ serviceTierSlug: 'retired-tier' }));

      expect(response.statusCode).toBe(400);
      expect(response.json<Envelope>().error.details?.[0]?.path).toBe('/serviceTierSlug');
    });

    it('409s an outdated form version', async () => {
      app = await applicationsApp().appPromise;
      const response = await submit(validBody({ formVersion: 'v0' }));

      expect(response.statusCode).toBe(409);
      expect(response.json<Envelope>().error.code).toBe('FORM_VERSION_OUTDATED');
    });

    it('409s a duplicate submission', async () => {
      app = await applicationsApp().appPromise;
      await submit(validBody(), { remoteAddress: '198.51.100.1' });
      const response = await submit(validBody(), { remoteAddress: '198.51.100.2' });

      expect(response.statusCode).toBe(409);
      expect(response.json<Envelope>().error.code).toBe('DUPLICATE_SUBMISSION');
    });

    it('503s when applications are closed', async () => {
      app = await applicationsApp({ form: undefined }).appPromise;
      expect((await submit(validBody())).statusCode).toBe(503);
    });

    it('rejects unknown top-level fields', async () => {
      app = await applicationsApp().appPromise;
      expect((await submit(validBody({ status: 'ACCEPTED' }))).statusCode).toBe(400);
    });

    it('rate-limits submissions per IP with its own counter', async () => {
      app = await applicationsApp({
        env: { APPLICATION_RATE_LIMIT_MAX: '2', APPLICATION_RATE_LIMIT_WINDOW_MS: '60000' },
      }).appPromise;

      await submit(validBody({ answers: { ...TEST_ANSWERS, about: 'a' } }));
      await submit({ invalid: true });
      const limited = await submit(validBody({ answers: { ...TEST_ANSWERS, about: 'c' } }));

      expect(limited.statusCode).toBe(429);
      expect(limited.json<Envelope>().error.code).toBe('RATE_LIMITED');
      expect((await app.inject('/api/v1/applications/form')).statusCode).toBe(200);
    });

    it('defaults to 5 submissions per hour per IP and 7-day status tokens', () => {
      expect(testConfig().applications).toEqual({
        rateLimit: { max: 5, windowMs: 3_600_000 },
        statusTokenTtlMs: 7 * 24 * 3_600_000,
      });
    });

    it('answers honeypot bots with a plausible 201 but stores nothing', async () => {
      const ctx = applicationsApp();
      app = await ctx.appPromise;
      const response = await submit(validBody({ honeypot: 'bot filled this' }));

      expect(response.statusCode).toBe(201);
      expect(ctx.state.applications).toEqual([]);
      const { application, statusAccess } = response.json<Created>().data;
      expect((await status(application.id, `Bearer ${statusAccess.token}`)).statusCode).toBe(404);
    });
  });

  describe('GET /api/v1/applications/:id/status', () => {
    async function submitted() {
      const ctx = applicationsApp();
      app = await ctx.appPromise;
      const created = (await submit(validBody())).json<Created>().data;
      return { ...ctx, created };
    }

    it('returns the public status to the token holder', async () => {
      const { created } = await submitted();
      const response = await status(created.application.id, `Bearer ${created.statusAccess.token}`);

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const body = response.json<{ data: Record<string, unknown> }>();
      expect(body.data).toEqual({
        reference: created.application.reference,
        status: 'UNDER_REVIEW',
        submittedAt: expect.any(String),
      });
    });

    it('never exposes internal fields, even when set', async () => {
      const { created, state } = await submitted();
      Object.assign(state.applications[0]!, {
        status: 'REJECTED',
        rejectionReason: 'INTERNAL-REASON-MARKER',
        reviewedBy: '00000000-0000-4000-8000-000000000501',
      });
      const response = await status(created.application.id, `Bearer ${created.statusAccess.token}`);

      expect(response.json<{ data: { status: string } }>().data.status).toBe('NOT_ACCEPTED');
      expect(response.body).not.toContain('INTERNAL-REASON-MARKER');
      expect(response.body).not.toContain('reviewedBy');
      expect(response.body).not.toContain('about'); // no answers
    });

    it.each([undefined, 'Bearer', 'Basic abc', 'Bearer not-a-token'])(
      '401s with WWW-Authenticate for authorization %j',
      async (authorization) => {
        const { created } = await submitted();
        const response = await status(created.application.id, authorization);

        expect(response.statusCode).toBe(401);
        expect(response.headers['www-authenticate']).toBe('Bearer');
        expect(response.json<Envelope>().error.code).toBe('UNAUTHORIZED');
      },
    );

    it('returns the same 404 for an unknown id, a wrong token, and another application token', async () => {
      const { created } = await submitted();
      const other = (await submit(validBody({ email: 'other@example.com' }))).json<Created>().data;

      const responses = await Promise.all([
        status('00000000-0000-4000-8000-000000000999', `Bearer ${created.statusAccess.token}`),
        status(created.application.id, `Bearer ${'A'.repeat(43)}`),
        status(created.application.id, `Bearer ${other.statusAccess.token}`),
      ]);
      const bodies = responses.map((r) => {
        const { error } = r.json<{ error: Record<string, unknown> }>();
        return { status: r.statusCode, code: error.code, message: error.message };
      });

      expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
      expect(bodies[0]).toEqual({
        status: 404,
        code: 'NOT_FOUND',
        message: 'Application not found.',
      });
    });

    it('does not accept the token in the query string', async () => {
      const { created } = await submitted();
      const response = await app.inject(
        `/api/v1/applications/${created.application.id}/status?token=${created.statusAccess.token}`,
      );
      expect(response.statusCode).toBe(401);
    });

    it('400s a non-UUID id', async () => {
      const { created } = await submitted();
      const response = await status('PHI-2026-AAAAAA', `Bearer ${created.statusAccess.token}`);
      expect(response.statusCode).toBe(400);
    });
  });

  describe('logging', () => {
    it('never logs contact details, answers, or the status token', async () => {
      const logs = createLogCollector();
      const ctx = applicationsApp({ env: { LOG_LEVEL: 'trace' }, logStream: logs.stream });
      app = await ctx.appPromise;

      const created = (
        await submit(
          validBody({
            name: PII.name,
            email: PII.email,
            phone: PII.phone,
            companyName: PII.companyName,
            answers: { ...TEST_ANSWERS, about: PII.secretAnswer },
          }),
        )
      ).json<Created>().data;
      await status(created.application.id, `Bearer ${created.statusAccess.token}`);
      await submit(validBody({ email: PII.email, answers: { about: PII.secretAnswer } }));

      expect(logs.text).toContain('"statusCode":201');
      for (const value of [...Object.values(PII), created.statusAccess.token]) {
        expect(logs.text).not.toContain(value);
      }
    });
  });

  describe('wiring and OpenAPI', () => {
    it('is not registered without a database or service', async () => {
      app = await buildTestApp();
      expect((await app.inject('/api/v1/applications/form')).statusCode).toBe(404);
    });

    it('documents the operations, bearer security, and schemas', async () => {
      app = await applicationsApp().appPromise;
      await app.ready();
      const spec = app.swagger() as {
        paths: Record<
          string,
          Record<string, { operationId?: string; security?: unknown; tags?: string[] }>
        >;
        components?: {
          schemas?: Record<string, unknown>;
          securitySchemes?: Record<string, unknown>;
        };
      };

      expect(spec.paths['/api/v1/applications/form']?.get?.operationId).toBe('getApplicationForm');
      expect(spec.paths['/api/v1/applications']?.post?.operationId).toBe('submitApplication');
      const statusOp = spec.paths['/api/v1/applications/{id}/status']?.get;
      expect(statusOp?.operationId).toBe('getApplicationStatus');
      expect(statusOp?.security).toEqual([{ applicationStatusToken: [] }]);
      expect(spec.components?.securitySchemes?.applicationStatusToken).toMatchObject({
        type: 'http',
        scheme: 'bearer',
      });
      for (const name of [
        'ApplicationForm',
        'ApplicationFormQuestion',
        'ApplicationSubmission',
        'ApplicationCreatedResponse',
        'ApplicationStatusResponse',
      ]) {
        expect(spec.components?.schemas, name).toHaveProperty(name);
      }
    });
  });
});
