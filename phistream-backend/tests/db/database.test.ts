/**
 * Runs against a real PostgreSQL database named in TEST_DATABASE_URL.
 * Skipped when it is not set. The database's schema is DROPPED and rebuilt
 * from migrations, so the database name must contain "test".
 *
 * Database test files run one at a time (vitest "db" project), because each
 * resets the shared test database.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../../src/app.js';
import type { Database } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrator.js';
import { demoId } from '../../src/db/seed/demo-data.js';
import { seedDemoData, unseedDemoContent } from '../../src/db/seed/seed.js';
import { testConfig } from '../helpers/test-app.js';
import {
  connectAdmin,
  createTestDatabase,
  resetTestDatabase,
  TEST_CONNECTION,
  TEST_DATABASE_URL,
} from '../helpers/test-database.js';

const connection = TEST_CONNECTION;

const EXPECTED_TABLES = [
  'analytics_events',
  'application_access_tokens',
  'application_answers',
  'application_events',
  'application_forms',
  'application_notes',
  'applications',
  'audit_logs',
  'contact_submissions',
  'faqs',
  'leads',
  'meetings',
  'notification_deliveries',
  'notification_events',
  'scheduling_sessions',
  'scheduling_webhook_events',
  'service_tiers',
  'site_config',
  'staff_users',
  'testimonials',
];

/** drizzle wraps driver errors; the PostgreSQL SQLSTATE lives on the cause. */
function sqlState(error: unknown): string | undefined {
  let current: unknown = error;
  while (current instanceof Error) {
    if (
      'code' in current &&
      typeof current.code === 'string' &&
      /^[0-9A-Z]{5}$/.test(current.code)
    ) {
      return current.code;
    }
    current = current.cause;
  }
  return undefined;
}

async function expectSqlState(promise: Promise<unknown>, code: string): Promise<void> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  expect(error, `expected SQLSTATE ${code}`).toBeDefined();
  expect(sqlState(error)).toBe(code);
}

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';
const UNIQUE_VIOLATION = '23505';

describe.skipIf(!TEST_DATABASE_URL)('database (PostgreSQL)', () => {
  let admin: pg.Client;
  let database: Database;

  beforeAll(async () => {
    admin = await connectAdmin();
    // Start from an empty database (migrations are applied by the tests below).
    await resetTestDatabase(admin);
    database = createTestDatabase();
  });

  afterAll(async () => {
    await database.close();
    await admin.end();
  });

  describe('migrations', () => {
    it('migrate a clean database from zero', async () => {
      const result = await runMigrations(TEST_DATABASE_URL ?? '', connection);
      expect(result.applied).toBeGreaterThanOrEqual(2);
      expect(result.total).toBe(result.applied);
    });

    it('are a no-op when re-run', async () => {
      const result = await runMigrations(TEST_DATABASE_URL ?? '', connection);
      expect(result.applied).toBe(0);
    });

    it('serialize concurrent runs', async () => {
      const results = await Promise.all([
        runMigrations(TEST_DATABASE_URL ?? '', connection),
        runMigrations(TEST_DATABASE_URL ?? '', connection),
      ]);
      expect(results.map((r) => r.applied)).toEqual([0, 0]);
    });

    it('create every table with row level security enabled', async () => {
      const { rows } = await admin.query<{ relname: string; relrowsecurity: boolean }>(
        `select c.relname, c.relrowsecurity from pg_class c
           join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
      );
      expect(rows.map((r) => r.relname)).toEqual(EXPECTED_TABLES);
      expect(rows.every((r) => r.relrowsecurity)).toBe(true);
    });

    it('revoke Supabase API role privileges on every table', async () => {
      const { rows } = await admin.query<{ table_name: string }>(
        `select table_name from information_schema.role_table_grants
          where grantee = 'anon' and table_schema = 'public'`,
      );
      expect(rows).toEqual([]);
    });

    it('revoke Supabase API role access to functions (no PostgREST RPC)', async () => {
      const { rows } = await admin.query<{ proname: string }>(
        `select p.proname from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'EXECUTE')`,
      );
      expect(rows).toEqual([]);
    });

    it('store all timestamps as timestamptz', async () => {
      const { rows } = await admin.query<{ column: string }>(
        `select table_name || '.' || column_name as column from information_schema.columns
          where table_schema = 'public' and data_type = 'timestamp without time zone'`,
      );
      expect(rows).toEqual([]);
    });
  });

  describe('constraints and referential integrity', () => {
    // applications.form_version must reference a known form version.
    beforeAll(async () => {
      await admin.query(
        `insert into application_forms (version, definition) values ('test-v1', '{}'), ('v1', '{}')`,
      );
    });

    const insertLead = (email = 'lead@example.com') =>
      admin.query<{ id: string }>(
        `insert into leads (email, full_name) values ($1, 'Test Lead') returning id`,
        [email],
      );
    const insertApplication = (leadId: string, reference: string) =>
      admin.query<{ id: string }>(
        `insert into applications (reference, lead_id, form_version) values ($1, $2, 'test-v1') returning id`,
        [reference, leadId],
      );

    it('applies defaults: UUID ids, NEW status, UTC timestamps', async () => {
      const { rows } = await admin.query<{ id: string; status: string; created_at: Date }>(
        `insert into leads (email, full_name) values ('defaults@example.com', 'X')
         returning id, status, created_at`,
      );
      expect(rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(rows[0]?.status).toBe('NEW');
      expect(rows[0]?.created_at).toBeInstanceOf(Date);
    });

    it('rejects unknown statuses', async () => {
      await expectSqlState(
        admin.query(
          `insert into leads (email, full_name, status) values ('a@example.com', 'A', 'HOT')`,
        ),
        CHECK_VIOLATION,
      );
      const lead = (await insertLead()).rows[0]!;
      await expectSqlState(
        admin.query(
          `insert into applications (reference, lead_id, form_version, status) values ('T-1', $1, 'v1', 'MAYBE')`,
          [lead.id],
        ),
        CHECK_VIOLATION,
      );
    });

    it('rejects malformed emails', async () => {
      await expectSqlState(
        admin.query(`insert into leads (email, full_name) values ('not-an-email', 'A')`),
        CHECK_VIOLATION,
      );
    });

    it('rejects applications for unknown leads', async () => {
      await expectSqlState(
        insertApplication('00000000-0000-4000-8000-999999999999', 'T-FK'),
        FOREIGN_KEY_VIOLATION,
      );
    });

    it('enforces unique application references', async () => {
      const lead = (await insertLead()).rows[0]!;
      await insertApplication(lead.id, 'T-UNIQUE');
      await expectSqlState(insertApplication(lead.id, 'T-UNIQUE'), UNIQUE_VIOLATION);
    });

    it('allows the same email on several leads (business rule not yet confirmed)', async () => {
      await insertLead('repeat@example.com');
      await expect(insertLead('REPEAT@example.com')).resolves.toBeDefined();
    });

    it('allows one answer per question per application', async () => {
      const lead = (await insertLead()).rows[0]!;
      const app = (await insertApplication(lead.id, 'T-ANS')).rows[0]!;
      const answer = `insert into application_answers (application_id, question_key, answer) values ($1, 'q_one', '"x"')`;
      await admin.query(answer, [app.id]);
      await expectSqlState(admin.query(answer, [app.id]), UNIQUE_VIOLATION);
    });

    it('only allows a rejection reason on rejected applications', async () => {
      const lead = (await insertLead()).rows[0]!;
      await expectSqlState(
        admin.query(
          `insert into applications (reference, lead_id, form_version, status, rejection_reason)
           values ('T-RR', $1, 'v1', 'ACCEPTED', 'nope')`,
          [lead.id],
        ),
        CHECK_VIOLATION,
      );
    });

    it('requires price and currency together, with an ISO currency code', async () => {
      await expectSqlState(
        admin.query(
          `insert into service_tiers (slug, name, description, price_amount) values ('t-a', 'A', 'd', 100)`,
        ),
        CHECK_VIOLATION,
      );
      await expectSqlState(
        admin.query(
          `insert into service_tiers (slug, name, description, price_amount, currency) values ('t-b', 'B', 'd', 100, 'usd')`,
        ),
        CHECK_VIOLATION,
      );
    });

    it('rejects meetings that end before they start', async () => {
      const lead = (await insertLead()).rows[0]!;
      const app = (await insertApplication(lead.id, 'T-MTG')).rows[0]!;
      await expectSqlState(
        admin.query(
          `insert into meetings (application_id, provider, starts_at, ends_at)
           values ($1, 'demo', now(), now() - interval '1 hour')`,
          [app.id],
        ),
        CHECK_VIOLATION,
      );
    });

    it('requires an expiry for scheduling tokens and one session per application', async () => {
      const lead = (await insertLead()).rows[0]!;
      const app = (await insertApplication(lead.id, 'T-SCH')).rows[0]!;
      const hash = 'a'.repeat(64);
      await expectSqlState(
        admin.query(
          `insert into scheduling_sessions (application_id, provider, token_hash) values ($1, 'demo', $2)`,
          [app.id, hash],
        ),
        CHECK_VIOLATION,
      );
      const session = `insert into scheduling_sessions (application_id, provider) values ($1, 'demo')`;
      await admin.query(session, [app.id]);
      await expectSqlState(admin.query(session, [app.id]), UNIQUE_VIOLATION);
    });

    it('rejects analytics events outside the allowed list', async () => {
      await expectSqlState(
        admin.query(
          `insert into analytics_events (event_name, anonymous_session_id) values ('revenue_booked', 'session-123')`,
        ),
        CHECK_VIOLATION,
      );
    });

    it('cascades lead deletion to private application data', async () => {
      const lead = (await insertLead('delete-me@example.com')).rows[0]!;
      const app = (await insertApplication(lead.id, 'T-DEL')).rows[0]!;
      await admin.query(
        `insert into application_answers (application_id, question_key, answer) values ($1, 'q', '1')`,
        [app.id],
      );
      await admin.query(
        `insert into analytics_events (event_name, anonymous_session_id, application_id)
         values ('application_submit', 'session-del', $1)`,
        [app.id],
      );

      await admin.query('delete from leads where id = $1', [lead.id]);

      const remaining = await admin.query(
        `select (select count(*) from applications where id = $1)::int as applications,
                (select count(*) from application_answers where application_id = $1)::int as answers,
                (select count(*) from analytics_events where anonymous_session_id = 'session-del')::int as events,
                (select count(*) from analytics_events where application_id = $1)::int as linked_events`,
        [app.id],
      );
      // The anonymous event survives but is unlinked from the deleted application.
      expect(remaining.rows[0]).toEqual({
        applications: 0,
        answers: 0,
        events: 1,
        linked_events: 0,
      });
    });

    it('prevents deleting a service tier that applications reference', async () => {
      const tier = await admin.query<{ id: string }>(
        `insert into service_tiers (slug, name, description) values ('t-ref', 'Ref', 'd') returning id`,
      );
      const lead = (await insertLead()).rows[0]!;
      await admin.query(
        `insert into applications (reference, lead_id, form_version, service_tier_id) values ('T-TIER', $1, 'v1', $2)`,
        [lead.id, tier.rows[0]!.id],
      );
      await expectSqlState(
        admin.query('delete from service_tiers where id = $1', [tier.rows[0]!.id]),
        FOREIGN_KEY_VIOLATION,
      );
    });
  });

  describe('seed', () => {
    it('inserts demo data, then is a no-op on re-run', async () => {
      const first = await seedDemoData(database.db);
      expect(first.inserted.service_tiers).toBe(3);
      expect(first.inserted.applications).toBe(2);

      const second = await seedDemoData(database.db);
      expect(Object.values(second.inserted).every((count) => count === 0)).toBe(true);
    });

    it('keeps inactive and private demo content hidden', async () => {
      const { rows } = await admin.query<{ slug: string; is_active: boolean }>(
        `select slug, is_active from service_tiers where id = $1`,
        [demoId(103)],
      );
      expect(rows[0]).toEqual({ slug: 'demo-tier-hidden', is_active: false });

      const config = await admin.query<{ is_public: boolean }>(
        `select is_public from site_config where key = 'internal.demo_private_setting'`,
      );
      expect(config.rows[0]?.is_public).toBe(false);
    });

    it('unseeds demo content but keeps tiers and the application form', async () => {
      const first = await unseedDemoContent(database.db);
      expect(first.deleted).toEqual({ testimonials: 3, faqs: 3, site_config: 3 });

      const shown = await admin.query<{ n: number }>(
        `select (select count(*) from testimonials)::int
              + (select count(*) from faqs)::int
              + (select count(*) from site_config
                 where key in ('contact.email', 'contact.phone', 'social.links'))::int as n`,
      );
      expect(shown.rows[0]?.n).toBe(0);

      const kept = await admin.query<{ tiers: number; forms: number }>(
        `select (select count(*) from service_tiers)::int as tiers,
                (select count(*) from application_forms)::int as forms`,
      );
      expect(kept.rows[0]?.tiers).toBe(3);
      expect(kept.rows[0]?.forms).toBeGreaterThan(0);

      const second = await unseedDemoContent(database.db);
      expect(Object.values(second.deleted).every((count) => count === 0)).toBe(true);
    });
  });

  describe('app integration', () => {
    it('reports ready when the database is reachable', async () => {
      const app = await buildApp({ config: testConfig(), database: createTestDatabase(1) });
      const response = await app.inject({ method: 'GET', url: '/api/v1/health/ready' });
      await app.close();

      expect(response.statusCode).toBe(200);
    });
  });
});
