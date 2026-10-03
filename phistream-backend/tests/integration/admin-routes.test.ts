import { DrizzleQueryError } from 'drizzle-orm/errors';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { AdminService } from '../../src/modules/admin/admin.service.js';
import type { ApplicationsRepository } from '../../src/modules/applications/applications.repository.js';
import { createApplicationReviewService } from '../../src/modules/applications/application-review.service.js';
import { createFakeApplicationsRepository } from '../helpers/fake-applications.js';
import { buildTestApp, createLogCollector, testConfig } from '../helpers/test-app.js';
import { createFakeStaffDirectory, createTestStaffAuth } from '../helpers/staff-auth.js';

const APP_ID = '00000000-0000-4000-8000-000000000701';
const ADMIN = {
  id: '00000000-0000-4000-8000-000000000501',
  authProviderId: 'sub-admin',
  role: 'ADMIN',
  email: 'admin@example.com',
  displayName: 'Admin',
  isActive: true,
} as const;
const REVIEWER = {
  id: '00000000-0000-4000-8000-000000000502',
  authProviderId: 'sub-reviewer',
  role: 'REVIEWER',
  email: 'reviewer@example.com',
  displayName: 'Reviewer',
  isActive: true,
} as const;
const INACTIVE = {
  id: '00000000-0000-4000-8000-000000000503',
  authProviderId: 'sub-inactive',
  role: 'ADMIN',
  email: 'gone@example.com',
  displayName: 'Gone',
  isActive: false,
} as const;

const page = { limit: 20, offset: 0, total: 0 };
const stubAdminService: AdminService = {
  listLeads: () => Promise.resolve({ data: [], pagination: page }),
  listApplications: () => Promise.resolve({ data: [], pagination: page }),
  getApplication: () => Promise.reject(new Error('not used')),
  listContactSubmissions: () => Promise.resolve({ data: [], pagination: page }),
  listAuditLogs: () => Promise.resolve({ data: [], pagination: page }),
};

/** Every admin route, with a valid request body where one is needed. */
const ROUTES = [
  { method: 'GET', url: '/api/v1/admin/leads' },
  { method: 'GET', url: '/api/v1/admin/contact-submissions' },
  { method: 'GET', url: '/api/v1/admin/applications' },
  { method: 'GET', url: `/api/v1/admin/applications/${APP_ID}` },
  { method: 'POST', url: `/api/v1/admin/applications/${APP_ID}/review` },
  { method: 'POST', url: `/api/v1/admin/applications/${APP_ID}/accept` },
  { method: 'POST', url: `/api/v1/admin/applications/${APP_ID}/reject`, payload: {} },
  { method: 'POST', url: `/api/v1/admin/applications/${APP_ID}/notes`, payload: { body: 'x' } },
  { method: 'GET', url: '/api/v1/admin/audit-logs' },
] as const;

interface Envelope {
  error: { code: string; message: string };
}

describe('admin routes', () => {
  let auth: Awaited<ReturnType<typeof createTestStaffAuth>>;
  let app: App;

  beforeAll(async () => {
    auth = await createTestStaffAuth();
  });

  afterEach(async () => {
    await app.close();
  });

  function adminApp(
    options: {
      repository?: ApplicationsRepository;
      withVerifier?: boolean;
      logStream?: { write(message: string): void };
    } = {},
  ) {
    const fake = createFakeApplicationsRepository();
    fake.state.applications.push({
      id: APP_ID,
      reference: 'PHI-2026-AAAAAA',
      leadId: '00000000-0000-4000-8000-000000000601',
      serviceTierId: null,
      formVersion: 'v1',
      submissionFingerprint: null,
      status: 'NEW',
      submittedAt: new Date(),
      createdAt: new Date(),
    });
    const directory = createFakeStaffDirectory([ADMIN, REVIEWER, INACTIVE].map((s) => ({ ...s })));
    const appPromise = buildApp({
      config: testConfig(options.logStream ? { LOG_LEVEL: 'info' } : {}),
      services: {
        admin: stubAdminService,
        review: createApplicationReviewService({
          repository: options.repository ?? fake.repository,
        }),
        staffDirectory: directory,
      },
      ...(options.withVerifier === false ? {} : { staffTokenVerifier: auth.verifier }),
      ...(options.logStream ? { logStream: options.logStream } : {}),
    });
    return { appPromise, ...fake, directory };
  }

  const call = async (
    route: (typeof ROUTES)[number] | { method: 'GET' | 'POST'; url: string; payload?: object },
    authorization?: string,
  ) =>
    app.inject({
      method: route.method,
      url: route.url,
      ...('payload' in route && route.payload ? { payload: route.payload } : {}),
      headers: authorization === undefined ? {} : { authorization },
    });

  const bearer = async (subject: string) => `Bearer ${await auth.tokenFor(subject)}`;

  describe('authentication', () => {
    it.each(ROUTES)('$method $url → 401 without a token', async (route) => {
      app = await adminApp().appPromise;
      const response = await call(route);

      expect(response.statusCode).toBe(401);
      expect(response.headers['www-authenticate']).toBe('Bearer');
      expect(response.json<Envelope>().error.code).toBe('UNAUTHORIZED');
    });

    it.each([
      ['a non-bearer scheme', 'Basic YWRtaW46YWRtaW4='],
      ['a non-JWT bearer', 'Bearer abcdef'],
      ['an empty bearer', 'Bearer '],
    ])('401s %s', async (_, authorization) => {
      app = await adminApp().appPromise;
      expect((await call(ROUTES[0], authorization)).statusCode).toBe(401);
    });

    it.each([
      ['expired', { expiresIn: Math.floor(Date.now() / 1000) - 60 }],
      ['wrong issuer', { issuer: 'https://other.supabase.co/auth/v1' }],
      ['wrong audience', { audience: 'anon' }],
      ['anon role', { claims: { role: 'anon' } }],
    ])('401s a token with %s', async (_, options) => {
      app = await adminApp().appPromise;
      const token = await auth.tokenFor(ADMIN.authProviderId, options);
      expect((await call(ROUTES[0], `Bearer ${token}`)).statusCode).toBe(401);
    });

    it('401s a token signed by someone else, even for a real staff subject', async () => {
      app = await adminApp().appPromise;
      const forger = await createTestStaffAuth();
      const token = await forger.tokenFor(ADMIN.authProviderId);
      expect((await call(ROUTES[0], `Bearer ${token}`)).statusCode).toBe(401);
    });

    it('403s a valid identity that is not provisioned as staff', async () => {
      app = await adminApp().appPromise;
      const response = await call(ROUTES[0], await bearer('some-signed-up-user'));

      expect(response.statusCode).toBe(403);
      expect(response.json<Envelope>().error.message).toBe(
        'This account does not have staff access.',
      );
    });

    it('403s deactivated staff immediately, with a still-valid token', async () => {
      const ctx = adminApp();
      app = await ctx.appPromise;
      const token = await bearer(REVIEWER.authProviderId);
      expect((await call(ROUTES[0], token)).statusCode).toBe(200);

      ctx.directory.staff.find((s) => s.id === REVIEWER.id)!.isActive = false;
      expect((await call(ROUTES[0], token)).statusCode).toBe(403);
    });

    it('authenticates before validating input (no schema probing)', async () => {
      app = await adminApp().appPromise;
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/applications/not-a-uuid/notes`,
        payload: { wrong: true },
      });
      expect(response.statusCode).toBe(401);
    });

    it('answers 503 when staff auth is not configured', async () => {
      app = await adminApp({ withVerifier: false }).appPromise;
      const response = await call(ROUTES[0], await bearer(ADMIN.authProviderId));

      expect(response.statusCode).toBe(503);
      expect(response.json<Envelope>().error.message).toBe(
        'Staff authentication is not configured.',
      );
    });

    it('never applies staff auth to public routes', async () => {
      app = await adminApp().appPromise;
      expect((await app.inject('/api/v1/health')).statusCode).toBe(200);
    });

    it('lets CORS preflight through without a token', async () => {
      app = await buildApp({
        config: testConfig({ CORS_ALLOWED_ORIGINS: 'https://admin.example.com' }),
        services: {
          admin: stubAdminService,
          review: createApplicationReviewService({
            repository: createFakeApplicationsRepository().repository,
          }),
          staffDirectory: createFakeStaffDirectory([]),
        },
        staffTokenVerifier: auth.verifier,
      });
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/admin/leads',
        headers: {
          origin: 'https://admin.example.com',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization',
        },
      });
      expect(response.statusCode).toBe(204);
      expect(response.headers['access-control-allow-headers']).toContain('Authorization');
    });

    it('is not registered without a database or admin services', async () => {
      app = await buildTestApp();
      expect((await app.inject('/api/v1/admin/leads')).statusCode).toBe(404);
    });
  });

  describe('authorization', () => {
    it.each(ROUTES.filter((r) => r.url !== '/api/v1/admin/audit-logs' && r.method === 'GET'))(
      'REVIEWER may $method $url',
      async (route) => {
        app = await adminApp().appPromise;
        const response = await call(route, await bearer(REVIEWER.authProviderId));
        // The detail stub throws; anything but 401/403 proves access was granted.
        expect([200, 500]).toContain(response.statusCode);
      },
    );

    it('REVIEWER cannot read audit logs', async () => {
      app = await adminApp().appPromise;
      const response = await call(
        { method: 'GET', url: '/api/v1/admin/audit-logs' },
        await bearer(REVIEWER.authProviderId),
      );
      expect(response.statusCode).toBe(403);
      expect(response.json<Envelope>().error.code).toBe('FORBIDDEN');
    });

    it('ADMIN can read audit logs', async () => {
      app = await adminApp().appPromise;
      const response = await call(
        { method: 'GET', url: '/api/v1/admin/audit-logs' },
        await bearer(ADMIN.authProviderId),
      );
      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
    });
  });

  describe('review actions', () => {
    it('lets a reviewer start review, accept, and add notes', async () => {
      const ctx = adminApp();
      app = await ctx.appPromise;
      const token = await bearer(REVIEWER.authProviderId);

      const review = await call(
        { method: 'POST', url: `/api/v1/admin/applications/${APP_ID}/review` },
        token,
      );
      expect(review.statusCode).toBe(200);
      expect(review.json()).toEqual({
        data: { id: APP_ID, status: 'UNDER_REVIEW', events: ['REVIEW_STARTED'] },
      });

      const accept = await call(
        { method: 'POST', url: `/api/v1/admin/applications/${APP_ID}/accept` },
        token,
      );
      expect(accept.json()).toEqual({
        data: { id: APP_ID, status: 'SCHEDULING_OPEN', events: ['ACCEPTED', 'SCHEDULING_ENABLED'] },
      });

      const note = await call(
        {
          method: 'POST',
          url: `/api/v1/admin/applications/${APP_ID}/notes`,
          payload: { body: 'Looks good' },
        },
        token,
      );
      expect(note.statusCode).toBe(201);
      expect(ctx.state.auditLogs.map((a) => [a.action, a.actorId])).toEqual([
        ['application.review_started', REVIEWER.id],
        ['application.accepted', REVIEWER.id],
        ['application.note_added', REVIEWER.id],
      ]);
    });

    it('lets a reviewer reject with a reason', async () => {
      const ctx = adminApp();
      app = await ctx.appPromise;
      ctx.state.applications[0]!.status = 'UNDER_REVIEW';

      const response = await call(
        {
          method: 'POST',
          url: `/api/v1/admin/applications/${APP_ID}/reject`,
          payload: { reason: 'Not now' },
        },
        await bearer(REVIEWER.authProviderId),
      );
      expect(response.statusCode).toBe(200);
      expect(ctx.state.applications[0]).toMatchObject({
        status: 'REJECTED',
        rejectionReason: 'Not now',
      });
    });

    it('accepts a reject request without a body', async () => {
      const ctx = adminApp();
      app = await ctx.appPromise;
      ctx.state.applications[0]!.status = 'UNDER_REVIEW';

      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/admin/applications/${APP_ID}/reject`,
        headers: { authorization: await bearer(REVIEWER.authProviderId) },
      });
      expect(response.statusCode).toBe(200);
    });

    it('409s an invalid transition with a helpful message and changes nothing', async () => {
      const ctx = adminApp();
      app = await ctx.appPromise;

      const response = await call(
        { method: 'POST', url: `/api/v1/admin/applications/${APP_ID}/accept` },
        await bearer(ADMIN.authProviderId),
      );
      expect(response.statusCode).toBe(409);
      expect(response.json<Envelope>().error).toMatchObject({
        code: 'CONFLICT',
        message: 'An application cannot move from NEW to ACCEPTED.',
      });
      expect(ctx.state.auditLogs).toEqual([]);
    });

    it('404s unknown applications', async () => {
      app = await adminApp().appPromise;
      const response = await call(
        {
          method: 'POST',
          url: '/api/v1/admin/applications/00000000-0000-4000-8000-000000000999/review',
        },
        await bearer(ADMIN.authProviderId),
      );
      expect(response.statusCode).toBe(404);
    });

    it.each([
      ['empty note', { body: '' }],
      ['whitespace note', { body: '   ' }],
      ['oversized note', { body: 'x'.repeat(10_001) }],
      ['unknown field', { body: 'ok', pinned: true }],
    ])('400s a note with %s', async (_, payload) => {
      app = await adminApp().appPromise;
      const response = await call(
        { method: 'POST', url: `/api/v1/admin/applications/${APP_ID}/notes`, payload },
        await bearer(ADMIN.authProviderId),
      );
      expect(response.statusCode).toBe(400);
    });

    it('400s an oversized rejection reason', async () => {
      const ctx = adminApp();
      app = await ctx.appPromise;
      ctx.state.applications[0]!.status = 'UNDER_REVIEW';
      const response = await call(
        {
          method: 'POST',
          url: `/api/v1/admin/applications/${APP_ID}/reject`,
          payload: { reason: 'x'.repeat(5001) },
        },
        await bearer(ADMIN.authProviderId),
      );
      expect(response.statusCode).toBe(400);
    });

    it('offers no generic status-setting endpoint', async () => {
      app = await adminApp().appPromise;
      const token = await bearer(ADMIN.authProviderId);
      for (const [method, url] of [
        ['PATCH', `/api/v1/admin/applications/${APP_ID}`],
        ['PUT', `/api/v1/admin/applications/${APP_ID}/status`],
        ['POST', `/api/v1/admin/applications/${APP_ID}/status`],
      ] as const) {
        const response = await app.inject({
          method,
          url,
          headers: { authorization: token },
          payload: { status: 'ACCEPTED' },
        });
        expect(response.statusCode, `${method} ${url}`).toBe(404);
      }
    });
  });

  describe('query validation', () => {
    it.each([
      '/api/v1/admin/leads?limit=101',
      '/api/v1/admin/leads?status=HOT',
      '/api/v1/admin/leads?stauts=NEW',
      '/api/v1/admin/leads?search=a',
      '/api/v1/admin/leads?createdFrom=2026-01-01',
      '/api/v1/admin/leads?createdFrom=2026-02-01T00:00:00Z&createdTo=2026-01-01T00:00:00Z',
      '/api/v1/admin/applications?serviceTierId=growth',
      '/api/v1/admin/applications?status=MAYBE',
      '/api/v1/admin/audit-logs?action=application.deleted',
    ])('400s %s', async (url) => {
      app = await adminApp().appPromise;
      const response = await call({ method: 'GET', url }, await bearer(ADMIN.authProviderId));
      expect(response.statusCode).toBe(400);
      expect(response.json<Envelope>().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('error hygiene', () => {
    it('never returns database errors to the client', async () => {
      const logs = createLogCollector();
      const failing: ApplicationsRepository = {
        ...createFakeApplicationsRepository().repository,
        withApplicationLock: () =>
          Promise.reject(
            new DrizzleQueryError(
              'update "applications" set "status" = $1 where "id" = $2',
              ['ACCEPTED', APP_ID],
              Object.assign(new Error('deadlock detected'), {
                code: '40P01',
                detail: 'Process 123 waits for ShareLock',
              }),
            ),
          ),
      };
      app = await adminApp({ repository: failing, logStream: logs.stream }).appPromise;

      const response = await call(
        { method: 'POST', url: `/api/v1/admin/applications/${APP_ID}/accept` },
        await bearer(ADMIN.authProviderId),
      );
      expect(response.statusCode).toBe(500);
      expect(response.json<Envelope>().error).toMatchObject({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      });
      for (const leaked of ['update', 'applications', 'deadlock', '40P01', 'ShareLock']) {
        expect(response.body).not.toContain(leaked);
      }
      // It is logged for operators, with the acting staff user.
      expect(logs.text).toContain('40P01');
      expect(logs.text).toContain(ADMIN.id);
    });

    it('never logs bearer tokens', async () => {
      const logs = createLogCollector();
      app = await adminApp({ logStream: logs.stream }).appPromise;
      const token = await auth.tokenFor(ADMIN.authProviderId);
      await call(ROUTES[0], `Bearer ${token}`);
      await call(ROUTES[0], `Bearer ${token}x`);

      expect(logs.text).not.toContain(token);
    });
  });

  describe('OpenAPI', () => {
    it('documents every admin operation with the staff bearer scheme', async () => {
      app = await adminApp().appPromise;
      await app.ready();
      const spec = app.swagger() as {
        paths: Record<
          string,
          Record<string, { operationId?: string; security?: unknown; tags?: string[] }>
        >;
        components?: { securitySchemes?: Record<string, unknown> };
      };
      const admin = Object.entries(spec.paths)
        .filter(([path]) => path.startsWith('/api/v1/admin/'))
        .flatMap(([path, item]) =>
          Object.entries(item).map(([method, op]) => ({ path, method, ...op })),
        );

      expect(admin.map((op) => op.operationId).sort()).toEqual([
        'adminAcceptApplication',
        'adminAddApplicationNote',
        'adminGetApplication',
        'adminListApplications',
        'adminListAuditLogs',
        'adminListContactSubmissions',
        'adminListLeads',
        'adminRejectApplication',
        'adminStartReview',
      ]);
      for (const op of admin) {
        expect(op.security, op.path).toEqual([{ staffBearer: [] }]);
        expect(op.tags).toEqual(['admin']);
      }
      expect(spec.components?.securitySchemes?.staffBearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
      });
    });
  });
});
