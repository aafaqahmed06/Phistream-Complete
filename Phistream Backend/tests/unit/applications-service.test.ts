import { describe, expect, it, vi } from 'vitest';

import {
  createApplicationsService,
  DEFAULT_APPLICATION_POLICY,
  type ApplicationSubmissionInput,
} from '../../src/modules/applications/applications.service.js';
import { createSpamGuard, type SpamVerdict } from '../../src/shared/anti-spam/spam-guard.js';
import { hashAccessToken } from '../../src/shared/security/access-tokens.js';
import { createFakeApplicationsRepository, TEST_ANSWERS } from '../helpers/fake-applications.js';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const TIER_ID = '00000000-0000-4000-8000-000000000101';

const input = (
  overrides: Partial<ApplicationSubmissionInput> = {},
): ApplicationSubmissionInput => ({
  formVersion: 'v1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  answers: TEST_ANSWERS,
  ...overrides,
});

const context = { remoteIp: '203.0.113.1' };

function setup(
  options: {
    verdict?: SpamVerdict;
    form?: { version: string; definition: unknown } | undefined;
  } = {},
) {
  let clock = new Date('2026-05-01T12:00:00Z');
  const now = () => clock;
  const fake = createFakeApplicationsRepository({
    ...('form' in options ? { form: options.form } : {}),
    tiers: {
      growth: { id: TIER_ID, isActive: true },
      retired: { id: '00000000-0000-4000-8000-000000000102', isActive: false },
    },
    now,
  });
  const logger = { info: vi.fn(), error: vi.fn() };
  const { verdict } = options;
  const service = createApplicationsService({
    repository: fake.repository,
    spamGuard: createSpamGuard(verdict ? [{ name: 'fixed', check: () => verdict }] : []),
    logger,
    policy: { statusTokenTtlMs: TTL_MS },
    now,
  });
  const advance = (ms: number) => {
    clock = new Date(clock.getTime() + ms);
  };
  return { ...fake, service, logger, advance, now };
}

const errorOf = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (e: unknown) => e,
  );

describe('applications service', () => {
  describe('submit', () => {
    it('creates the application, answers, SUBMITTED event, token, and notification', async () => {
      const { service, state, now } = setup();

      const created = await service.submit(
        input({ serviceTierSlug: 'growth', source: 'instagram', phone: '+1 555 0100' }),
        context,
      );

      expect(created.reference).toMatch(/^PHI-2026-[0-9A-Z]{6}$/);
      expect(state.applications).toHaveLength(1);
      const [application] = state.applications;
      expect(application).toMatchObject({
        id: created.id,
        reference: created.reference,
        serviceTierId: TIER_ID,
        formVersion: 'v1',
        status: 'NEW',
        submittedAt: now(),
      });
      expect(application?.submissionFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(state.leads).toEqual([
        expect.objectContaining({ email: 'jane@example.com', source: 'instagram', status: 'NEW' }),
      ]);
      expect(application?.leadId).toBe(state.leads[0]?.id);

      expect(state.answers.map((a) => [a.questionKey, a.answer])).toEqual([
        ['about', 'I make videos.'],
        ['platform', 'instagram'],
        ['agree', true],
      ]);
      expect(state.events).toEqual([
        {
          applicationId: created.id,
          eventType: 'SUBMITTED',
          actorType: 'APPLICANT',
          actorId: null,
          metadata: { formVersion: 'v1' },
        },
      ]);
      expect(state.notifications).toEqual([
        { eventType: 'APPLICATION_SUBMITTED', subjectType: 'application', subjectId: created.id },
      ]);
    });

    it('stores only a hash of the status token, with the configured expiry', async () => {
      const { service, state, now } = setup();
      const created = await service.submit(input(), context);

      expect(created.statusAccess.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(created.statusAccess.expiresAt).toEqual(new Date(now().getTime() + TTL_MS));
      expect(state.tokens).toEqual([
        {
          applicationId: created.id,
          purpose: 'STATUS',
          tokenHash: hashAccessToken(created.statusAccess.token),
          expiresAt: created.statusAccess.expiresAt,
          revokedAt: null,
        },
      ]);
      expect(JSON.stringify(state)).not.toContain(created.statusAccess.token);
    });

    it('associates later applications with the open lead, filling blanks only', async () => {
      const { service, state } = setup();
      await service.submit(input({ source: 'instagram' }), context);
      await service.submit(
        input({
          name: 'Other Name',
          source: 'tiktok',
          companyName: 'Acme',
          answers: { ...TEST_ANSWERS, about: 'Second' },
        }),
        context,
      );

      expect(state.leads).toHaveLength(1);
      expect(state.leads[0]).toMatchObject({
        fullName: 'Jane Doe',
        source: 'instagram',
        companyName: 'Acme',
      });
      expect(state.applications.map((a) => a.leadId)).toEqual([
        state.leads[0]?.id,
        state.leads[0]?.id,
      ]);
    });

    it('opens a new lead when the latest one is closed', async () => {
      const { service, state } = setup();
      await service.submit(input(), context);
      state.leads[0]!.status = 'LOST';
      await service.submit(input({ answers: { ...TEST_ANSWERS, about: 'Again' } }), context);

      expect(state.leads.map((lead) => lead.status)).toEqual(['LOST', 'NEW']);
    });

    it('retries with a new reference when one is already taken', async () => {
      const { service, state } = setup();
      state.referenceCollisions = 2;
      const created = await service.submit(input(), context);

      expect(state.attemptedReferences).toHaveLength(3);
      expect(created.reference).toBe(state.attemptedReferences[2]);
      expect(state.applications).toHaveLength(1);
    });

    it('fails without writing when no free reference is found after 5 attempts', async () => {
      const { service, state } = setup();
      state.referenceCollisions = 5;

      await expect(service.submit(input(), context)).rejects.toThrow(
        'unique application reference',
      );
      expect(state.attemptedReferences).toHaveLength(5);
      expect(state.applications).toEqual([]);
    });

    describe('form versioning', () => {
      it('rejects an outdated form version with 409 FORM_VERSION_OUTDATED', async () => {
        const { service, state } = setup();
        const error = await errorOf(service.submit(input({ formVersion: 'v0' }), context));

        expect(error).toMatchObject({ statusCode: 409, code: 'FORM_VERSION_OUTDATED' });
        expect(state.applications).toEqual([]);
      });

      it('returns 503 when no form is published', async () => {
        const { service } = setup({ form: undefined });
        const error = await errorOf(service.submit(input(), context));

        expect(error).toMatchObject({ statusCode: 503, code: 'SERVICE_UNAVAILABLE' });
      });

      it('refuses (and logs) a stored definition that is invalid', async () => {
        const { service, logger } = setup({
          form: { version: 'broken', definition: { legacyPlaceholder: true, questions: [] } },
        });

        await expect(service.getActiveForm()).rejects.toMatchObject({ statusCode: 404 });
        await expect(
          service.submit(input({ formVersion: 'broken' }), context),
        ).rejects.toMatchObject({
          statusCode: 503,
        });
        expect(logger.error).toHaveBeenCalledWith({ formVersion: 'broken' }, expect.any(String));
      });
    });

    describe('answers and service tier', () => {
      it('returns VALIDATION_ERROR with /answers/<key> paths and writes nothing', async () => {
        const { service, state } = setup();
        const error = await errorOf(
          service.submit(
            input({ answers: { platform: 'myspace', agree: true, extra: 1 } }),
            context,
          ),
        );

        expect(error).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
        const paths = (error as { details: { path: string }[] }).details.map((d) => d.path);
        expect(paths).toEqual(
          expect.arrayContaining(['/answers', '/answers/about', '/answers/platform']),
        );
        expect(state.applications).toEqual([]);
      });

      it.each(['retired', 'missing'])('rejects a %s service tier the same way', async (slug) => {
        const { service, state } = setup();
        const error = await errorOf(service.submit(input({ serviceTierSlug: slug }), context));

        expect(error).toMatchObject({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          details: [
            { location: 'body', path: '/serviceTierSlug', message: 'is not an available service' },
          ],
        });
        expect(state.applications).toEqual([]);
      });

      it('allows no service tier', async () => {
        const { service, state } = setup();
        await service.submit(input(), context);
        expect(state.applications[0]?.serviceTierId).toBeNull();
      });
    });

    describe('duplicate submissions', () => {
      it('rejects an identical resubmission within the window with 409 DUPLICATE_SUBMISSION', async () => {
        const { service, state, advance } = setup();
        await service.submit(input(), context);
        advance(DEFAULT_APPLICATION_POLICY.duplicateWindowMs - 1000);

        // Different name casing/spacing and answer order: still the same application.
        const error = await errorOf(
          service.submit(
            input({
              name: 'JANE DOE',
              answers: { agree: true, platform: 'instagram', about: 'I make videos.' },
            }),
            context,
          ),
        );
        expect(error).toMatchObject({ statusCode: 409, code: 'DUPLICATE_SUBMISSION' });
        expect(state.applications).toHaveLength(1);
        expect(state.notifications).toHaveLength(1);
      });

      it('accepts the same answers again after the window', async () => {
        const { service, state, advance } = setup();
        await service.submit(input(), context);
        advance(DEFAULT_APPLICATION_POLICY.duplicateWindowMs + 1000);

        await service.submit(input(), context);
        expect(state.applications).toHaveLength(2);
      });

      it('treats changed answers as a new application', async () => {
        const { service, state } = setup();
        await service.submit(input(), context);
        await service.submit(input({ answers: { ...TEST_ANSWERS, about: 'Changed' } }), context);
        expect(state.applications).toHaveLength(2);
      });

      it('caps applications per email per 24 hours with 429', async () => {
        const { service, state, advance } = setup();
        for (let i = 0; i < DEFAULT_APPLICATION_POLICY.maxApplicationsPerEmail; i++) {
          await service.submit(input({ answers: { ...TEST_ANSWERS, about: `v${i}` } }), context);
        }
        const error = await errorOf(
          service.submit(input({ answers: { ...TEST_ANSWERS, about: 'one more' } }), context),
        );
        expect(error).toMatchObject({ statusCode: 429, code: 'RATE_LIMITED' });
        expect(state.applications).toHaveLength(DEFAULT_APPLICATION_POLICY.maxApplicationsPerEmail);

        advance(DEFAULT_APPLICATION_POLICY.capWindowMs + 1000);
        await service.submit(input({ answers: { ...TEST_ANSWERS, about: 'next day' } }), context);
      });
    });

    describe('spam screening', () => {
      it('returns a plausible response for discarded bots but stores nothing', async () => {
        const { service, state } = setup({ verdict: { action: 'discard', reason: 'honeypot' } });
        const created = await service.submit(input(), context);

        expect(created.reference).toMatch(/^PHI-/);
        expect(created.statusAccess.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect([state.leads, state.applications, state.tokens, state.notifications]).toEqual([
          [],
          [],
          [],
          [],
        ]);
        await expect(
          service.getStatus(created.id, created.statusAccess.token),
        ).rejects.toMatchObject({
          statusCode: 404,
        });
      });

      it('throws VERIFICATION_FAILED on reject', async () => {
        const { service } = setup({ verdict: { action: 'reject', reason: 'verification_failed' } });
        await expect(service.submit(input(), context)).rejects.toMatchObject({
          statusCode: 400,
          code: 'VERIFICATION_FAILED',
        });
      });
    });

    it('logs identifiers only', async () => {
      const { service, logger } = setup();
      const created = await service.submit(
        input({ phone: '+1 555 0199', answers: { ...TEST_ANSWERS, about: 'SECRET-ANSWER' } }),
        context,
      );

      const logged = JSON.stringify(logger.info.mock.calls);
      expect(logged).toContain(created.id);
      for (const value of [
        'jane@example.com',
        'Jane Doe',
        'SECRET-ANSWER',
        '555 0199',
        created.statusAccess.token,
        created.reference,
      ]) {
        expect(logged).not.toContain(value);
      }
    });
  });

  describe('getStatus', () => {
    async function submitted() {
      const ctx = setup();
      const created = await ctx.service.submit(input(), context);
      return { ...ctx, created };
    }

    it('returns the public status for the token holder', async () => {
      const { service, created, state, now } = await submitted();
      expect(await service.getStatus(created.id, created.statusAccess.token)).toEqual({
        reference: created.reference,
        status: 'UNDER_REVIEW',
        submittedAt: now(),
      });

      state.applications[0]!.status = 'REJECTED';
      state.applications[0]!.rejectionReason = 'internal reason';
      const view = await service.getStatus(created.id, created.statusAccess.token);
      expect(view.status).toBe('NOT_ACCEPTED');
      expect(JSON.stringify(view)).not.toContain('internal reason');
    });

    it.each([undefined, '', 'short', 'x'.repeat(43) + '!'])(
      '401s a missing or malformed token (%j)',
      async (token) => {
        const { service, created } = await submitted();
        await expect(service.getStatus(created.id, token)).rejects.toMatchObject({
          statusCode: 401,
          code: 'UNAUTHORIZED',
        });
      },
    );

    it('404s identically for unknown ids, wrong tokens, other applications, expiry and revocation', async () => {
      const { service, created, state, advance } = await submitted();
      const other = await service.submit(input({ email: 'other@example.com' }), context);
      const wrongToken = 'A'.repeat(43);

      const failures = [
        service.getStatus('00000000-0000-4000-8000-000000000999', created.statusAccess.token),
        service.getStatus(created.id, wrongToken),
        service.getStatus(created.id, other.statusAccess.token),
      ];
      state.tokens[1]!.revokedAt = new Date();
      failures.push(service.getStatus(other.id, other.statusAccess.token));
      const errors = await Promise.all(failures.map(errorOf));

      advance(TTL_MS);
      errors.push(await errorOf(service.getStatus(created.id, created.statusAccess.token)));

      for (const error of errors) {
        expect(error).toMatchObject({
          statusCode: 404,
          code: 'NOT_FOUND',
          message: 'Application not found.',
        });
      }
    });
  });
});
