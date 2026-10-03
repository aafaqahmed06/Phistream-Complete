/**
 * Public content visibility against real PostgreSQL (TEST_DATABASE_URL).
 * Verifies the actual SQL filters: unpublished rows and private/unregistered
 * config never reach public endpoints.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { Paginated, PublicServiceTier } from '../../src/modules/content/content.schemas.js';
import { testConfig } from '../helpers/test-app.js';
import {
  connectAdmin,
  createTestDatabase,
  resetAndMigrate,
  TEST_DATABASE_URL,
} from '../helpers/test-database.js';

/** Markers that must never appear in any public response. */
const HIDDEN = 'HIDDEN-MARKER';

describe.skipIf(!TEST_DATABASE_URL)('public content visibility (PostgreSQL)', () => {
  let admin: pg.Client;
  let app: App;

  beforeAll(async () => {
    admin = await connectAdmin();
    await resetAndMigrate(admin);

    await admin.query(`
      insert into service_tiers (slug, name, description, price_amount, currency, display_order, is_active, features) values
        ('second', 'Second', 'Visible', null, null, 2, true, '["F2"]'),
        ('first', 'First', 'Visible', 150000, 'XTS', 1, true, '["F1", 7]'),
        ('hidden-tier', '${HIDDEN} tier', '${HIDDEN}', null, null, 0, false, '[]');

      insert into faqs (question, answer, display_order, is_active) values
        ('Visible question?', 'Visible answer.', 1, true),
        ('${HIDDEN} question?', '${HIDDEN}', 0, false);

      insert into testimonials (name, quote, display_order, is_active) values
        ('Visible Person', 'Visible quote.', 1, true),
        ('${HIDDEN} Person', '${HIDDEN}', 0, false);

      insert into site_config (key, value, is_public) values
        ('contact.email', '"hello@example.com"', true),
        ('contact.phone', '"${HIDDEN}"', false),
        ('onboarding.headline', '"Visible headline"', true),
        ('onboarding.vsl_url', '"javascript:${HIDDEN}"', true),
        ('onboarding.steps', '[{"title": "Step one"}]', true),
        ('internal.unregistered', '"${HIDDEN}"', true),
        ('internal.private', '"${HIDDEN}"', false);
    `);

    app = await buildApp({ config: testConfig(), database: createTestDatabase() });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  const endpoints = [
    '/api/v1/content/home',
    '/api/v1/content/services',
    '/api/v1/content/faqs',
    '/api/v1/content/testimonials',
    '/api/v1/content/onboarding',
    '/api/v1/content/services/first',
  ];

  it.each(endpoints)('%s never returns unpublished, private, or invalid content', async (url) => {
    const response = await app.inject(url);

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(HIDDEN);
    // Internal column names must not appear in any shape.
    for (const field of ['isActive', 'is_active', 'displayOrder', 'createdAt', 'updatedAt']) {
      expect(response.body).not.toContain(`"${field}"`);
    }
  });

  it('lists active services in display order with a correct total', async () => {
    const body = (await app.inject('/api/v1/content/services')).json<
      Paginated<PublicServiceTier>
    >();

    expect(body.data.map((t) => t.slug)).toEqual(['first', 'second']);
    expect(body.pagination).toEqual({ limit: 20, offset: 0, total: 2 });
    expect(body.data[0]?.price).toEqual({ amountMinor: 150_000, currency: 'XTS' });
    expect(body.data[0]?.features).toEqual(['F1']);
    expect(body.data[1]?.price).toBeNull();
  });

  it('paginates in the database', async () => {
    const body = (await app.inject('/api/v1/content/services?limit=1&offset=1')).json<
      Paginated<PublicServiceTier>
    >();

    expect(body.data.map((t) => t.slug)).toEqual(['second']);
    expect(body.pagination.total).toBe(2);
  });

  it('returns 404 for an inactive service slug, same as an unknown one', async () => {
    const inactive = await app.inject('/api/v1/content/services/hidden-tier');
    const unknown = await app.inject('/api/v1/content/services/does-not-exist');

    expect(inactive.statusCode).toBe(404);
    expect(unknown.statusCode).toBe(404);
    expect(inactive.json().error.message).toBe(unknown.json().error.message);
  });

  it('counts only active FAQs and testimonials', async () => {
    const faqs = (await app.inject('/api/v1/content/faqs')).json();
    const testimonials = (await app.inject('/api/v1/content/testimonials')).json();

    expect(faqs.pagination.total).toBe(1);
    expect(testimonials.pagination.total).toBe(1);
  });

  it('serves only public, registered, valid config', async () => {
    const home = (await app.inject('/api/v1/content/home')).json().data;
    const onboarding = (await app.inject('/api/v1/content/onboarding')).json().data;

    expect(home.contact).toEqual({ email: 'hello@example.com', phone: null });
    expect(onboarding).toEqual({
      headline: 'Visible headline',
      vsl: { url: null }, // stored value is not an https URL
      steps: [{ title: 'Step one', description: null }],
    });
  });

  it('reflects publishing changes immediately (no server-side cache)', async () => {
    await admin.query(`update faqs set is_active = false where question = 'Visible question?'`);
    const body = (await app.inject('/api/v1/content/faqs')).json();
    await admin.query(`update faqs set is_active = true where question = 'Visible question?'`);

    expect(body.data).toEqual([]);
  });
});
