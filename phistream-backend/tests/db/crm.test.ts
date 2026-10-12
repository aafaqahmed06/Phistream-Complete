/**
 * CRM sync outbox against real PostgreSQL (TEST_DATABASE_URL): events are
 * queued in the same transaction as the lead/application write, only when a CRM
 * is configured, are listed under `kind=crm`, and are removed on erasure.
 */
import type pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildApp, type App } from '../../src/app.js';
import type { Database } from '../../src/db/client.js';
import { createApplicationsRepository } from '../../src/modules/applications/applications.repository.js';
import { createNotificationsRepository } from '../../src/modules/notifications/notifications.repository.js';
import { eraseLead } from '../../src/modules/admin/data-retention.js';
import type { CrmProvider } from '../../src/providers/crm/crm-provider.js';
import { testConfig } from '../helpers/test-app.js';
import {
  connectAdmin,
  createTestDatabase,
  resetAndMigrate,
  TEST_DATABASE_URL,
} from '../helpers/test-database.js';

const crmProvider: CrmProvider = {
  name: 'fake',
  syncContact: vi.fn(() => Promise.resolve()),
  syncApplication: vi.fn(() => Promise.resolve()),
  erase: vi.fn(() => Promise.resolve()),
};

describe.skipIf(!TEST_DATABASE_URL)('CRM sync outbox (PostgreSQL)', () => {
  let admin: pg.Client;
  let database: Database;
  let app: App;

  beforeAll(async () => {
    admin = await connectAdmin();
    await resetAndMigrate(admin);
    database = createTestDatabase(5);
    app = await buildApp({
      config: testConfig({ CONTACT_RATE_LIMIT_MAX: '1000' }),
      database,
      crmProvider,
    });
  });

  afterAll(async () => {
    await app.close();
    await admin.end();
  });

  beforeEach(async () => {
    await admin.query('truncate leads, notification_events cascade');
  });

  const eventTypes = async () =>
    (
      await admin.query<{ event_type: string }>(
        'select event_type from notification_events order by event_type',
      )
    ).rows.map((row) => row.event_type);

  async function insertApplication() {
    const lead = await admin.query<{ id: string }>(
      `insert into leads (email, full_name) values ('jane@example.com', 'Jane') returning id`,
    );
    const application = await admin.query<{ id: string }>(
      `insert into applications (reference, lead_id, form_version)
       values ('CRM-1', $1, 'legacy-v1') returning id`,
      [lead.rows[0]?.id],
    );
    return { leadId: lead.rows[0]?.id ?? '', applicationId: application.rows[0]?.id ?? '' };
  }

  it('a contact message queues CONTACT_RECEIVED and a CRM_CONTACT_SYNC for the submission', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/contact',
      payload: { name: 'Jane Doe', email: 'jane@example.com', message: 'Hello' },
    });
    expect(response.statusCode).toBe(202);

    const submission = await admin.query<{ id: string }>('select id from contact_submissions');
    expect(await eventTypes()).toEqual(['CONTACT_RECEIVED', 'CRM_CONTACT_SYNC']);
    const crm = await admin.query(
      `select subject_type, subject_id from notification_events where event_type = 'CRM_CONTACT_SYNC'`,
    );
    expect(crm.rows).toEqual([
      { subject_type: 'contact_submission', subject_id: submission.rows[0]?.id },
    ]);
  });

  it('every application lifecycle event queues its own CRM sync, atomically', async () => {
    const { applicationId } = await insertApplication();
    const repository = createApplicationsRepository(database.db, { crm: true });
    const event = (eventType: 'REVIEW_STARTED' | 'SCHEDULING_REOPENED' | 'ACCEPTED') => ({
      applicationId,
      eventType,
      actorType: 'SYSTEM' as const,
      actorId: null,
      metadata: {},
    });

    await repository.withApplicationLock(applicationId, async (tx) => {
      await tx.insertEvent(event('REVIEW_STARTED'));
      await tx.insertEvent(event('SCHEDULING_REOPENED'));
    });
    await expect(
      repository.withApplicationLock(applicationId, async (tx) => {
        await tx.insertEvent(event('ACCEPTED'));
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');

    const synced = await admin.query<{ subject_id: string }>(
      `select subject_id from notification_events where event_type = 'CRM_APPLICATION_SYNC'`,
    );
    const events = await admin.query<{ id: string }>('select id from application_events');
    expect(events.rows).toHaveLength(2);
    expect(synced.rows.map((r) => r.subject_id).sort()).toEqual(
      events.rows.map((r) => r.id).sort(),
    );
  });

  it('queues nothing when the CRM is not configured', async () => {
    const { applicationId } = await insertApplication();
    await createApplicationsRepository(database.db).withApplicationLock(
      applicationId,
      async (tx) => {
        await tx.insertEvent({
          applicationId,
          eventType: 'REVIEW_STARTED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata: {},
        });
      },
    );
    expect(await eventTypes()).toEqual([]);
  });

  it('lists CRM events apart from email events', async () => {
    const { applicationId } = await insertApplication();
    await createApplicationsRepository(database.db, { crm: true }).withApplicationLock(
      applicationId,
      async (tx) => {
        await tx.insertEvent({
          applicationId,
          eventType: 'REVIEW_STARTED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata: {},
        });
        await tx.enqueueNotificationEvent({
          eventType: 'APPLICATION_SUBMITTED',
          subjectType: 'application',
          subjectId: applicationId,
        });
      },
    );
    const repository = createNotificationsRepository(database.db);
    const types = async (kind: 'crm' | 'email') =>
      (await repository.listEvents({ kind, limit: 10, offset: 0 })).items.map((e) => e.eventType);

    expect(await types('crm')).toEqual(['CRM_APPLICATION_SYNC']);
    expect(await types('email')).toEqual(['APPLICATION_SUBMITTED']);
  });

  it('erasing a lead removes its CRM events too', async () => {
    const { leadId, applicationId } = await insertApplication();
    await createApplicationsRepository(database.db, { crm: true }).withApplicationLock(
      applicationId,
      async (tx) => {
        await tx.insertEvent({
          applicationId,
          eventType: 'REVIEW_STARTED',
          actorType: 'SYSTEM',
          actorId: null,
          metadata: {},
        });
      },
    );
    expect(await eventTypes()).toEqual(['CRM_APPLICATION_SYNC']);

    await eraseLead(database.db, leadId, null);
    expect(await eventTypes()).toEqual([]);
  });
});
