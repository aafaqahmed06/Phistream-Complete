/**
 * Contact form against real PostgreSQL (TEST_DATABASE_URL): the actual SQL
 * behind the deduplication policy, the per-email lock, the outbox event, and
 * the constraints/cascades of the new tables.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import { testConfig } from '../helpers/test-app.js';
import {
  connectAdmin,
  createTestDatabase,
  resetAndMigrate,
  TEST_DATABASE_URL,
} from '../helpers/test-database.js';

interface LeadRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  company_name: string | null;
  source: string | null;
  campaign: string | null;
  status: string;
}

describe.skipIf(!TEST_DATABASE_URL)('contact form (PostgreSQL)', () => {
  let admin: pg.Client;
  let app: App;

  beforeAll(async () => {
    admin = await connectAdmin();
    await resetAndMigrate(admin);
    app = await buildApp({
      // High limit: these tests exercise the domain policy, not the rate limit.
      config: testConfig({ CONTACT_RATE_LIMIT_MAX: '1000' }),
      database: createTestDatabase(5),
    });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  beforeEach(async () => {
    await admin.query('truncate leads, notification_events cascade');
  });

  const submit = (body: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/contact',
      payload: { name: 'Jane Doe', email: 'jane@example.com', message: 'Hello', ...body },
    });

  const leadsFor = async (email: string) =>
    (
      await admin.query<LeadRow>(
        'select * from leads where lower(email) = $1 order by created_at, id',
        [email],
      )
    ).rows;

  const count = async (table: string) =>
    Number((await admin.query<{ n: string }>(`select count(*) as n from ${table}`)).rows[0]?.n);

  it('creates a lead, a submission, and a pending CONTACT_RECEIVED event atomically', async () => {
    const response = await submit({
      email: ' Jane@Example.com ',
      phone: '+1 555 0100',
      source: 'Instagram',
      campaign: 'bio',
    });
    expect(response.statusCode).toBe(202);

    const [lead] = await leadsFor('jane@example.com');
    expect(lead).toMatchObject({
      email: 'jane@example.com',
      full_name: 'Jane Doe',
      phone: '+1 555 0100',
      source: 'instagram',
      campaign: 'bio',
      status: 'NEW',
    });

    const submissions = await admin.query<{ id: string; lead_id: string; message: string }>(
      'select id, lead_id, message from contact_submissions',
    );
    expect(submissions.rows).toEqual([
      { id: expect.any(String), lead_id: lead?.id, message: 'Hello' },
    ]);

    const events = await admin.query(
      'select event_type, subject_type, subject_id, status, attempts from notification_events',
    );
    expect(events.rows).toEqual([
      {
        event_type: 'CONTACT_RECEIVED',
        subject_type: 'contact_submission',
        subject_id: submissions.rows[0]?.id,
        status: 'PENDING',
        attempts: 0,
      },
    ]);
  });

  it('attaches to the open lead and fills only blank fields', async () => {
    await admin.query(
      `insert into leads (email, full_name, phone, source, status)
       values ('Jane@Example.com', 'Original Name', '+1 555 0100', 'instagram', 'CONTACTED')`,
    );

    await submit({
      name: 'Impostor',
      phone: '+1 555 0999',
      companyName: 'NewCo',
      source: 'tiktok',
      campaign: 'spring',
    });

    const leads = await leadsFor('jane@example.com');
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({
      email: 'Jane@Example.com', // stored value untouched
      full_name: 'Original Name',
      phone: '+1 555 0100',
      source: 'instagram',
      company_name: 'NewCo',
      campaign: 'spring',
      status: 'CONTACTED',
    });
    const submission = await admin.query(
      'select full_name, phone, source from contact_submissions',
    );
    expect(submission.rows).toEqual([
      { full_name: 'Impostor', phone: '+1 555 0999', source: 'tiktok' },
    ]);
  });

  it('opens a new lead when the latest one is closed', async () => {
    await admin.query(
      `insert into leads (email, full_name, status, created_at)
       values ('jane@example.com', 'Jane', 'QUALIFIED', now() - interval '2 days'),
              ('jane@example.com', 'Jane', 'LOST', now() - interval '1 day')`,
    );

    await submit({});

    const leads = await leadsFor('jane@example.com');
    expect(leads.map((lead) => lead.status)).toEqual(['QUALIFIED', 'LOST', 'NEW']);
  });

  it('ignores an identical message within the duplicate window', async () => {
    await submit({ message: 'Same text' });
    await submit({ message: 'Same text' });
    await submit({ email: 'JANE@example.com', message: 'Same text' });

    expect(await count('contact_submissions')).toBe(1);
    expect(await count('notification_events')).toBe(1);
  });

  it('records an identical message again once it is older than the window', async () => {
    await submit({ message: 'Same text' });
    await admin.query(`update contact_submissions set created_at = now() - interval '25 hours'`);
    await submit({ message: 'Same text' });

    expect(await count('contact_submissions')).toBe(2);
  });

  it('throttles an email after 5 submissions within an hour', async () => {
    for (let i = 0; i < 7; i++) {
      expect((await submit({ message: `Message ${i}` })).statusCode).toBe(202);
    }
    expect(await count('contact_submissions')).toBe(5);

    await admin.query(`update contact_submissions set created_at = now() - interval '61 minutes'`);
    await submit({ message: 'After the window' });
    expect(await count('contact_submissions')).toBe(6);
  });

  it('serializes concurrent submissions for a new email into one lead', async () => {
    const responses = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        submit({ email: 'race@example.com', message: `Parallel ${i}` }),
      ),
    );

    expect(responses.every((response) => response.statusCode === 202)).toBe(true);
    expect(await leadsFor('race@example.com')).toHaveLength(1);
    expect(await count('contact_submissions')).toBe(5);
  });

  it('writes nothing for a honeypot submission', async () => {
    const response = await submit({ honeypot: 'filled by a bot' });

    expect(response.statusCode).toBe(202);
    expect(await count('leads')).toBe(0);
    expect(await count('notification_events')).toBe(0);
  });

  it('rolls back the lead if a later step of the transaction fails', async () => {
    // Force the outbox insert to fail after the lead and submission were written.
    await admin.query(
      `alter table notification_events add constraint test_block check (false) not valid`,
    );
    try {
      const response = await submit({ email: 'rollback@example.com' });
      expect(response.statusCode).toBe(500);
    } finally {
      await admin.query('alter table notification_events drop constraint test_block');
    }

    expect(await leadsFor('rollback@example.com')).toEqual([]);
    expect(await count('contact_submissions')).toBe(0);
  });

  describe('constraints', () => {
    it('deletes submissions with their lead (retention requests)', async () => {
      await submit({ email: 'erase@example.com' });
      await admin.query(`delete from leads where email = 'erase@example.com'`);

      expect(await count('contact_submissions')).toBe(0);
    });

    it('enforces one event per type and subject', async () => {
      const insert = () =>
        admin.query(
          `insert into notification_events (event_type, subject_type, subject_id)
           values ('CONTACT_RECEIVED', 'contact_submission', '00000000-0000-4000-8000-000000000001')`,
        );
      await insert();
      await expect(insert()).rejects.toMatchObject({ code: '23505' });
    });

    it.each([
      [
        `insert into notification_events (event_type, subject_type, subject_id) values ('contact_received', 'x', gen_random_uuid())`,
      ],
      [
        `insert into notification_events (event_type, subject_type, subject_id, status) values ('X', 'x', gen_random_uuid(), 'PROCESSED')`,
      ],
      [
        `insert into notification_events (event_type, subject_type, subject_id, status) values ('X', 'x', gen_random_uuid(), 'DONE')`,
      ],
    ])('rejects invalid notification events: %s', async (statement) => {
      await expect(admin.query(statement)).rejects.toMatchObject({ code: '23514' });
    });

    it('rejects over-long messages at the database too', async () => {
      await submit({ email: 'len@example.com' });
      const [lead] = await leadsFor('len@example.com');
      await expect(
        admin.query(
          `insert into contact_submissions (lead_id, full_name, message) values ($1, 'X', repeat('m', 5001))`,
          [lead?.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});
