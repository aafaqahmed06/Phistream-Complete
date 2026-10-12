import { describe, expect, it, vi } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import { createCrmSync } from '../../src/modules/crm/crm-sync.js';
import { createNotificationDispatcher } from '../../src/modules/notifications/dispatcher.js';
import { createAttioProvider } from '../../src/providers/crm/attio.js';
import { CrmSyncError } from '../../src/providers/crm/crm-provider.js';
import {
  createFakeEmailProvider,
  createFakeNotificationContext,
  createFakeNotificationsRepository,
} from '../helpers/fake-notifications.js';

const json = (status: number, body: unknown) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
const href = (input: string | URL | Request) =>
  typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
const record = (id: string) => ({ data: { id: { record_id: id } } });

const config = {
  apiKey: 'attio_secret_key',
  apiBaseUrl: 'https://api.attio.com/v2',
  dealOwnerEmail: 'owner@example.com',
  stages: {},
};
const person = { email: 'jane@example.com', name: 'Jane Q Doe', phone: '+1 (415) 555-0100' };
const deal = {
  reference: 'PHI-2026-ABC123',
  name: 'Jane – PHI-2026-ABC123',
  status: 'NEW',
} as const;

type Call = [string, RequestInit];
const calls = (fetch: ReturnType<typeof vi.fn>) => fetch.mock.calls as unknown as Call[];

describe('Attio provider', () => {
  it('asserts person then deal (linked, owned, staged) then adds the note', async () => {
    const fetch = vi.fn((url: string | URL | Request) =>
      json(
        200,
        record(
          href(url).includes('/people/')
            ? 'person-1'
            : href(url).includes('/deals/')
              ? 'deal-1'
              : 'note-1',
        ),
      ),
    );
    const provider = createAttioProvider(config, { fetch });

    await provider.syncApplication({ person, deal, note: { title: 'T', content: 'C' } });

    const [people, deals, note] = calls(fetch);
    expect(people?.[0]).toBe(
      'https://api.attio.com/v2/objects/people/records?matching_attribute=email_addresses',
    );
    expect(people?.[1].method).toBe('PUT');
    expect(people?.[1].headers).toMatchObject({ authorization: 'Bearer attio_secret_key' });
    expect(JSON.parse(people?.[1].body as string)).toEqual({
      data: {
        values: {
          email_addresses: [{ email_address: 'jane@example.com' }],
          name: [{ first_name: 'Jane', last_name: 'Q Doe', full_name: 'Jane Q Doe' }],
          phone_numbers: [{ original_phone_number: '+14155550100' }],
        },
      },
    });
    expect(deals?.[0]).toBe(
      'https://api.attio.com/v2/objects/deals/records?matching_attribute=phistream_reference',
    );
    expect(JSON.parse(deals?.[1].body as string).data.values).toEqual({
      phistream_reference: 'PHI-2026-ABC123',
      name: 'Jane – PHI-2026-ABC123',
      stage: 'Lead',
      owner: 'owner@example.com',
      associated_people: [{ target_object: 'people', target_record_id: 'person-1' }],
    });
    expect(note?.[0]).toBe('https://api.attio.com/v2/notes');
    expect(JSON.parse(note?.[1].body as string).data).toEqual({
      parent_object: 'people',
      parent_record_id: 'person-1',
      title: 'T',
      format: 'plaintext',
      content: 'C',
    });
  });

  it('uses configured stage titles and drops phone numbers Attio would reject', async () => {
    const fetch = vi.fn(() => json(200, record('x')));
    const provider = createAttioProvider({ ...config, stages: { NEW: 'Applied' } }, { fetch });

    await provider.syncApplication({ person: { ...person, phone: 'call me' }, deal });

    const [people, deals] = calls(fetch);
    expect(JSON.parse(people?.[1].body as string).data.values).not.toHaveProperty('phone_numbers');
    expect(JSON.parse(deals?.[1].body as string).data.values.stage).toBe('Applied');
  });

  it.each([
    [429, true],
    [503, true],
    [400, false],
    [401, false],
    [409, false],
  ])(
    'classifies HTTP %i as retryable=%s and keeps only the error code',
    async (status, retryable) => {
      const fetch = vi.fn(() =>
        json(status, { code: 'validation_type', message: 'jane@example.com is not valid' }),
      );
      const error = await createAttioProvider(config, { fetch })
        .syncContact({ person, note: { title: 'T', content: 'C' } })
        .catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CrmSyncError);
      expect(error).toMatchObject({ code: `attio_${status}_validation_type`, retryable });
      expect((error as Error).message).not.toContain('jane@example.com');
    },
  );

  it('treats network failures as retryable', async () => {
    const fetch = vi.fn(() => Promise.reject(new TypeError('fetch failed')));
    await expect(
      createAttioProvider(config, { fetch }).syncContact({
        person,
        note: { title: 'T', content: 'C' },
      }),
    ).rejects.toMatchObject({ code: 'attio_network', retryable: true });
  });

  it('erase deletes matching deals and people', async () => {
    const fetch = vi.fn((url: string | URL | Request, init?: RequestInit) =>
      init?.method === 'POST'
        ? json(200, { data: [{ id: { record_id: href(url).includes('deals') ? 'd1' : 'p1' } }] })
        : json(200, {}),
    );
    await createAttioProvider(config, { fetch }).erase({
      email: 'jane@example.com',
      references: ['PHI-2026-ABC123'],
    });

    expect(
      calls(fetch).map(([url, init]) => `${init.method} ${url.replace(config.apiBaseUrl, '')}`),
    ).toEqual([
      'POST /objects/deals/records/query',
      'POST /objects/people/records/query',
      'DELETE /objects/deals/records/d1',
      'DELETE /objects/people/records/p1',
    ]);
  });
});

describe('CRM events in the notification dispatcher', () => {
  const SUBMISSION_ID = '00000000-0000-4000-8000-000000000801';
  const contact = {
    name: 'Sam Sender',
    email: 'sam@example.com',
    phone: null,
    companyName: 'Sam Co',
    message: 'Hello there',
    source: 'instagram',
    campaign: null,
    receivedAt: new Date(),
  };

  function setup(provider?: { syncContact: ReturnType<typeof vi.fn> }) {
    const store = createFakeNotificationsRepository();
    const context = createFakeNotificationContext({ contacts: { [SUBMISSION_ID]: contact } });
    const crm = provider
      ? createCrmSync({
          db: {} as never, // contact syncs never touch the database directly
          provider: provider as never,
          context,
        })
      : undefined;
    const emails = createFakeEmailProvider();
    const dispatcher = createNotificationDispatcher({
      repository: store.repository,
      context,
      provider: emails,
      scheduling: undefined,
      crm,
      options: {
        from: 'a@example.com',
        replyTo: undefined,
        adminDashboardUrl: undefined,
        batchSize: 10,
        maxAttempts: 3,
      },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    });
    store.enqueue('CRM_CONTACT_SYNC', 'contact_submission', SUBMISSION_ID);
    return { ...store, dispatcher, emails };
  }

  it('syncs the contact and marks the event processed, sending no email', async () => {
    const provider = { syncContact: vi.fn(() => Promise.resolve()) };
    const ctx = setup(provider);

    expect(await ctx.dispatcher.runOnce()).toMatchObject({ processed: 1, failed: 0 });
    expect(provider.syncContact).toHaveBeenCalledWith({
      person: { email: 'sam@example.com', name: 'Sam Sender', phone: null },
      note: {
        title: 'Website contact message',
        content: 'Hello there\n\nChannel or company: Sam Co\nSource: instagram',
      },
    });
    expect(ctx.events[0]?.status).toBe('PROCESSED');
    expect(ctx.emails.sent).toHaveLength(0);
  });

  it('retries a transient failure and dead-letters a permanent one', async () => {
    const provider = {
      syncContact: vi
        .fn()
        .mockRejectedValueOnce(new CrmSyncError('attio_503', true))
        .mockRejectedValueOnce(new CrmSyncError('attio_400_validation_type', false)),
    };
    const ctx = setup(provider);

    expect(await ctx.dispatcher.runOnce()).toMatchObject({ retried: 1, failed: 0 });
    expect(ctx.events[0]).toMatchObject({ status: 'PENDING', lastError: 'attio_503' });

    // Make it due again, then fail permanently.
    ctx.events[0]!.nextAttemptAt = new Date(0);
    expect(await ctx.dispatcher.runOnce()).toMatchObject({ failed: 1 });
    expect(ctx.events[0]).toMatchObject({
      status: 'FAILED',
      lastError: 'attio_400_validation_type',
    });
  });

  it('completes as skipped when the CRM is not configured', async () => {
    const ctx = setup();
    expect(await ctx.dispatcher.runOnce()).toMatchObject({ processed: 1 });
    expect(ctx.events[0]?.status).toBe('PROCESSED');
  });

  it('skips events whose subject was erased', async () => {
    const provider = { syncContact: vi.fn() };
    const ctx = setup(provider);
    ctx.events[0]!.subjectId = '00000000-0000-4000-8000-0000000009ff';

    expect(await ctx.dispatcher.runOnce()).toMatchObject({ processed: 1 });
    expect(provider.syncContact).not.toHaveBeenCalled();
  });
});

describe('CRM configuration', () => {
  const base = { NODE_ENV: 'test' };

  it('is off without ATTIO_API_KEY', () => {
    expect(loadConfig(base).crm).toBeUndefined();
  });

  it('requires a deal owner and validates the stage map', () => {
    expect(() => loadConfig({ ...base, ATTIO_API_KEY: 'k' })).toThrow(/ATTIO_DEAL_OWNER_EMAIL/);
    expect(() =>
      loadConfig({
        ...base,
        ATTIO_API_KEY: 'k',
        ATTIO_DEAL_OWNER_EMAIL: 'o@example.com',
        ATTIO_STAGE_MAP: '{"BOGUS":"x"}',
      }),
    ).toThrow(/ATTIO_STAGE_MAP/);
    expect(
      loadConfig({
        ...base,
        ATTIO_API_KEY: 'k',
        ATTIO_DEAL_OWNER_EMAIL: 'o@example.com',
        ATTIO_STAGE_MAP: '{"NEW":"Applied"}',
      }).crm,
    ).toEqual({
      apiKey: 'k',
      apiBaseUrl: 'https://api.attio.com/v2',
      dealOwnerEmail: 'o@example.com',
      stages: { NEW: 'Applied' },
    });
  });
});
