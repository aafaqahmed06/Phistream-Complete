/**
 * OpenAPI accuracy (Phase 9), with every route registered (real database):
 * the published document must describe exactly the API that is served.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import { API_VERSION } from '../../src/config/constants.js';
import { createMockSchedulingProvider } from '../../src/providers/scheduling/mock.js';
import { createTestStaffAuth } from '../helpers/staff-auth.js';
import { testConfig } from '../helpers/test-app.js';
import { createTestDatabase, TEST_DATABASE_URL } from '../helpers/test-database.js';

interface Operation {
  operationId?: string;
  tags?: string[];
  summary?: string;
  security?: Record<string, unknown>[];
  responses?: Record<string, unknown>;
}

const EXPECTED_OPERATIONS = {
  'GET /api/v1/health': 'getHealth',
  'GET /api/v1/health/ready': 'getReadiness',
  'GET /api/v1/content/home': 'getHomeContent',
  'GET /api/v1/content/services': 'listServices',
  'GET /api/v1/content/services/{slug}': 'getService',
  'GET /api/v1/content/faqs': 'listFaqs',
  'GET /api/v1/content/testimonials': 'listTestimonials',
  'GET /api/v1/content/onboarding': 'getOnboardingContent',
  'POST /api/v1/contact': 'submitContact',
  'GET /api/v1/applications/form': 'getApplicationForm',
  'POST /api/v1/applications': 'submitApplication',
  'GET /api/v1/applications/{id}/status': 'getApplicationStatus',
  'POST /api/v1/analytics/events': 'recordAnalyticsEvent',
  'GET /api/v1/scheduling/session': 'getSchedulingSession',
  'POST /api/v1/webhooks/scheduling/{provider}': 'receiveSchedulingWebhook',
  'GET /api/v1/admin/leads': 'adminListLeads',
  'DELETE /api/v1/admin/leads/{id}': 'adminEraseLead',
  'GET /api/v1/admin/applications': 'adminListApplications',
  'GET /api/v1/admin/applications/{id}': 'adminGetApplication',
  'POST /api/v1/admin/applications/{id}/review': 'adminStartReview',
  'POST /api/v1/admin/applications/{id}/accept': 'adminAcceptApplication',
  'POST /api/v1/admin/applications/{id}/reject': 'adminRejectApplication',
  'POST /api/v1/admin/applications/{id}/notes': 'adminAddApplicationNote',
  'POST /api/v1/admin/applications/{id}/scheduling-access': 'adminIssueSchedulingAccess',
  'GET /api/v1/admin/applications/{id}/booking': 'adminLookupBooking',
  'GET /api/v1/admin/notifications': 'adminListNotifications',
  'POST /api/v1/admin/notifications/{id}/retry': 'adminRetryNotification',
  'GET /api/v1/admin/analytics/funnel': 'adminGetFunnel',
  'GET /api/v1/admin/audit-logs': 'adminListAuditLogs',
  'GET /api/v1/admin/contact-submissions': 'adminListContactSubmissions',
} as const;

describe.skipIf(!TEST_DATABASE_URL)('OpenAPI contract', () => {
  let app: App;
  let operations: [string, Operation][];
  let spec: {
    info: { version: string };
    paths: Record<string, Record<string, Operation>>;
    components: { securitySchemes: Record<string, unknown> };
  };

  beforeAll(async () => {
    app = await buildApp({
      config: testConfig(),
      database: createTestDatabase(1),
      staffTokenVerifier: (await createTestStaffAuth()).verifier,
      schedulingProvider: createMockSchedulingProvider({ webhookSecret: 'x'.repeat(20) }),
    });
    await app.ready();
    spec = app.swagger() as typeof spec;
    operations = Object.entries(spec.paths).flatMap(([path, item]) =>
      Object.entries(item).map(
        ([method, op]) => [`${method.toUpperCase()} ${path}`, op] as [string, Operation],
      ),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents exactly the served API, with the current version', () => {
    expect(Object.fromEntries(operations.map(([key, op]) => [key, op.operationId]))).toEqual(
      EXPECTED_OPERATIONS,
    );
    expect(spec.info.version).toBe(API_VERSION);
  });

  it('routes every documented operation', () => {
    for (const [key] of operations) {
      const [method = '', path = ''] = key.split(' ');
      const url = path.replace(/\{(\w+)\}/g, ':$1');
      expect(app.hasRoute({ method: method, url }), key).toBe(true);
    }
  });

  it('gives every operation a unique id, a tag, a summary, and the error envelope', () => {
    const ids = operations.map(([, op]) => op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [key, op] of operations) {
      expect(op.tags?.length, key).toBeGreaterThan(0);
      expect(op.summary, key).toBeTruthy();
      expect(Object.keys(op.responses ?? {}), key).toEqual(expect.arrayContaining(['4XX', '5XX']));
    }
  });

  it('declares the right credential on every protected operation', () => {
    for (const [key, op] of operations) {
      if (key.includes('/api/v1/admin/')) expect(op.security, key).toEqual([{ staffBearer: [] }]);
    }
    expect(spec.paths['/api/v1/applications/{id}/status']?.get?.security).toEqual([
      { applicationStatusToken: [] },
    ]);
    expect(spec.paths['/api/v1/scheduling/session']?.get?.security).toEqual([
      { schedulingToken: [] },
    ]);
    expect(Object.keys(spec.components.securitySchemes).sort()).toEqual([
      'applicationStatusToken',
      'schedulingToken',
      'staffBearer',
    ]);
  });

  it('keeps load-balancer probes out of the document but serves them', async () => {
    expect(spec.paths).not.toHaveProperty('/health');
    expect((await app.inject('/health')).statusCode).toBe(200);
  });
});
