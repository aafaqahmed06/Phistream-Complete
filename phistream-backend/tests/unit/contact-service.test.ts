import { describe, expect, it, vi } from 'vitest';

import {
  createContactService,
  DEFAULT_CONTACT_POLICY,
  type ContactSubmissionInput,
} from '../../src/modules/leads/contact.service.js';
import { createSpamGuard, type SpamVerdict } from '../../src/shared/anti-spam/spam-guard.js';
import { AppError } from '../../src/shared/errors/app-error.js';
import { createFakeLeadsRepository } from '../helpers/fake-leads.js';

const input = (overrides: Partial<ContactSubmissionInput> = {}): ContactSubmissionInput => ({
  name: 'Jane Doe',
  email: 'jane@example.com',
  message: 'Hello there.',
  ...overrides,
});

const context = { remoteIp: '203.0.113.1' };

function setup(options: { verdict?: SpamVerdict; start?: Date } = {}) {
  let clock = options.start ?? new Date('2026-01-01T12:00:00Z');
  const now = () => clock;
  const fake = createFakeLeadsRepository({ now });
  const logger = { info: vi.fn() };
  const { verdict } = options;
  const service = createContactService({
    repository: fake.repository,
    spamGuard: createSpamGuard(verdict ? [{ name: 'fixed', check: () => verdict }] : []),
    logger,
    now,
  });
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  return { ...fake, service, logger, advance };
}

describe('contact service', () => {
  describe('new contacts', () => {
    it('creates a NEW lead, a submission, and one CONTACT_RECEIVED event', async () => {
      const { service, leads, submissions, events } = setup();

      const result = await service.submit(
        input({ phone: '+1 555 0100', companyName: 'Acme', source: 'instagram', campaign: 'bio' }),
        context,
      );

      expect(result).toMatchObject({ outcome: 'RECORDED', leadCreated: true });
      expect(leads).toHaveLength(1);
      expect(leads[0]).toMatchObject({
        email: 'jane@example.com',
        fullName: 'Jane Doe',
        phone: '+1 555 0100',
        companyName: 'Acme',
        source: 'instagram',
        campaign: 'bio',
        status: 'NEW',
      });
      expect(submissions).toHaveLength(1);
      expect(submissions[0]).toMatchObject({ leadId: leads[0]?.id, message: 'Hello there.' });
      expect(events).toEqual([
        {
          eventType: 'CONTACT_RECEIVED',
          subjectType: 'contact_submission',
          subjectId: submissions[0]?.id,
        },
      ]);
    });

    it('stores absent optional fields as null', async () => {
      const { service, leads, submissions } = setup();
      await service.submit(input(), context);

      expect(leads[0]).toMatchObject({
        phone: null,
        companyName: null,
        source: null,
        campaign: null,
      });
      expect(submissions[0]).toMatchObject({ phone: null, companyName: null, source: null });
    });
  });

  describe('deduplication policy', () => {
    it('attaches a new message to the existing open lead', async () => {
      const { service, leads, submissions, events } = setup();
      await service.submit(input({ message: 'First' }), context);
      const second = await service.submit(input({ message: 'Second' }), context);

      expect(second).toMatchObject({
        outcome: 'RECORDED',
        leadCreated: false,
        leadId: leads[0]?.id,
      });
      expect(leads).toHaveLength(1);
      expect(submissions.map((s) => s.message)).toEqual(['First', 'Second']);
      expect(events).toHaveLength(2);
    });

    it.each(['NEW', 'CONTACTED', 'QUALIFIED'] as const)('reuses a %s lead', async (status) => {
      const { service, leads } = setup();
      await service.submit(input({ message: 'First' }), context);
      leads[0]!.status = status;
      await service.submit(input({ message: 'Second' }), context);

      expect(leads).toHaveLength(1);
      expect(leads[0]?.status).toBe(status); // never changed by a public submission
    });

    it.each(['CONVERTED', 'LOST', 'ARCHIVED'] as const)(
      'opens a new lead when the latest one is %s',
      async (status) => {
        const { service, leads } = setup();
        await service.submit(input({ message: 'First' }), context);
        leads[0]!.status = status;
        const result = await service.submit(input({ message: 'Second', name: 'Jane D.' }), context);

        expect(result).toMatchObject({ outcome: 'RECORDED', leadCreated: true });
        expect(leads.map((lead) => lead.status)).toEqual([status, 'NEW']);
        expect(leads[1]?.fullName).toBe('Jane D.');
      },
    );

    it('fills blank lead fields but never overwrites stored values', async () => {
      const { service, leads, submissions } = setup();
      await service.submit(input({ message: 'First', source: 'instagram' }), context);
      await service.submit(
        input({
          name: 'Someone Else',
          message: 'Second',
          phone: '+44 20 7946 0000',
          companyName: 'NewCo',
          source: 'tiktok',
          campaign: 'spring',
        }),
        context,
      );

      expect(leads[0]).toMatchObject({
        fullName: 'Jane Doe', // not overwritten
        source: 'instagram', // first touch kept
        phone: '+44 20 7946 0000', // was blank
        companyName: 'NewCo', // was blank
        campaign: 'spring', // was blank
      });
      // The submission keeps exactly what was sent this time.
      expect(submissions[1]).toMatchObject({
        fullName: 'Someone Else',
        source: 'tiktok',
        campaign: 'spring',
      });
    });

    it('ignores an identical message from the same email within the duplicate window', async () => {
      const { service, submissions, events, advance } = setup();
      await service.submit(input(), context);
      advance(DEFAULT_CONTACT_POLICY.duplicateWindowMs - 1000);
      const again = await service.submit(input(), context);

      expect(again).toEqual({ outcome: 'DUPLICATE' });
      expect(submissions).toHaveLength(1);
      expect(events).toHaveLength(1);
    });

    it('records an identical message again after the duplicate window', async () => {
      const { service, submissions, advance } = setup();
      await service.submit(input(), context);
      advance(DEFAULT_CONTACT_POLICY.duplicateWindowMs + 1000);

      expect((await service.submit(input(), context)).outcome).toBe('RECORDED');
      expect(submissions).toHaveLength(2);
    });

    it('throttles an email after the per-email cap and recovers after the window', async () => {
      const { service, submissions, events, advance } = setup();
      const max = DEFAULT_CONTACT_POLICY.maxSubmissionsPerEmail;
      for (let i = 0; i < max; i++) {
        expect((await service.submit(input({ message: `m${i}` }), context)).outcome).toBe(
          'RECORDED',
        );
      }

      expect(await service.submit(input({ message: 'one more' }), context)).toEqual({
        outcome: 'THROTTLED',
      });
      expect(submissions).toHaveLength(max);
      expect(events).toHaveLength(max);

      advance(DEFAULT_CONTACT_POLICY.floodWindowMs + 1000);
      expect((await service.submit(input({ message: 'later' }), context)).outcome).toBe('RECORDED');
    });

    it('counts the cap across every lead with the same email', async () => {
      const { service, leads } = setup();
      const max = DEFAULT_CONTACT_POLICY.maxSubmissionsPerEmail;
      for (let i = 0; i < max; i++) {
        await service.submit(input({ message: `m${i}` }), context);
        leads.at(-1)!.status = 'LOST'; // forces a new lead each time
      }

      expect((await service.submit(input({ message: 'x' }), context)).outcome).toBe('THROTTLED');
    });

    it('serializes concurrent submissions for one email into a single lead', async () => {
      const { service, leads, submissions } = setup();
      await Promise.all(
        ['a', 'b', 'c'].map((message) => service.submit(input({ message }), context)),
      );

      expect(leads).toHaveLength(1);
      expect(submissions).toHaveLength(3);
    });
  });

  describe('spam screening', () => {
    it('discards silently without writing anything', async () => {
      const { service, leads, submissions, events } = setup({
        verdict: { action: 'discard', reason: 'honeypot' },
      });

      expect(await service.submit(input(), context)).toEqual({
        outcome: 'DISCARDED',
        reason: 'honeypot',
      });
      expect([leads, submissions, events]).toEqual([[], [], []]);
    });

    it('throws VERIFICATION_FAILED on reject without writing anything', async () => {
      const { service, leads } = setup({
        verdict: { action: 'reject', reason: 'verification_failed' },
      });

      const error = await service.submit(input(), context).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 400, code: 'VERIFICATION_FAILED' });
      expect(leads).toEqual([]);
    });

    it('passes the message, IP, honeypot and token to the guard', async () => {
      const check = vi.fn(() => ({ action: 'accept' }) as const);
      const fake = createFakeLeadsRepository();
      const service = createContactService({
        repository: fake.repository,
        spamGuard: createSpamGuard([{ name: 'spy', check }]),
        logger: { info: () => undefined },
      });
      await service.submit(input(), {
        remoteIp: '198.51.100.7',
        honeypot: '',
        verificationToken: 'tok',
      });

      expect(check).toHaveBeenCalledWith({
        form: 'contact',
        remoteIp: '198.51.100.7',
        honeypot: '',
        verificationToken: 'tok',
        freeText: ['Hello there.'],
      });
    });
  });

  describe('logging', () => {
    it('logs outcome and identifiers only, never submitted values', async () => {
      const { service, logger } = setup();
      await service.submit(
        input({ phone: '+1 555 0199', companyName: 'SecretCo', source: 'instagram' }),
        context,
      );

      const logged = JSON.stringify(logger.info.mock.calls);
      expect(logged).toContain('RECORDED');
      for (const value of [
        'jane@example.com',
        'Jane Doe',
        'Hello there.',
        '555 0199',
        'SecretCo',
      ]) {
        expect(logged).not.toContain(value);
      }
    });
  });
});
