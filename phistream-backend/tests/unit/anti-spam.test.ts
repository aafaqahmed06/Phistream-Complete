import { describe, expect, it, vi } from 'vitest';

import {
  createPublicFormSpamGuard,
  honeypotCheck,
  humanVerificationCheck,
  linkLimitCheck,
} from '../../src/shared/anti-spam/checks.js';
import type { HumanVerifier } from '../../src/shared/anti-spam/human-verifier.js';
import { createSpamGuard, type FormSubmission } from '../../src/shared/anti-spam/spam-guard.js';

const submission = (overrides: Partial<FormSubmission> = {}): FormSubmission => ({
  form: 'contact',
  remoteIp: '203.0.113.1',
  honeypot: undefined,
  verificationToken: undefined,
  freeText: ['Hello'],
  ...overrides,
});

const silent = { warn: () => undefined };

/** Fake verifier; `spy` is the same mock as `verify`, for assertions. */
function verifier(result: boolean | Error) {
  const spy = vi.fn(() =>
    result instanceof Error ? Promise.reject(result) : Promise.resolve({ success: result }),
  );
  const fake: HumanVerifier & { spy: typeof spy } = { provider: 'fake', verify: spy, spy };
  return fake;
}

describe('anti-spam checks', () => {
  describe('honeypot', () => {
    it.each([undefined, '', '   '])('accepts an empty honeypot (%j)', (honeypot) => {
      expect(honeypotCheck().check(submission({ honeypot }))).toEqual({ action: 'accept' });
    });

    it('discards a filled honeypot', () => {
      expect(honeypotCheck().check(submission({ honeypot: 'https://spam.example' }))).toEqual({
        action: 'discard',
        reason: 'honeypot',
      });
    });
  });

  describe('link limit', () => {
    const check = linkLimitCheck({ maxLinks: 2 });

    it('accepts up to the limit', () => {
      const text = 'see https://a.example and www.b.example';
      expect(check.check(submission({ freeText: [text] }))).toEqual({ action: 'accept' });
    });

    it('discards above the limit, counting across fields and case-insensitively', () => {
      const verdict = check.check(
        submission({ freeText: ['HTTP://a.example https://b.example', 'WWW.c.example'] }),
      );
      expect(verdict).toEqual({ action: 'discard', reason: 'too_many_links' });
    });
  });

  describe('human verification', () => {
    it('rejects a missing token without calling the provider', async () => {
      const fake = verifier(true);
      const verdict = await humanVerificationCheck(fake, silent).check(submission());

      expect(verdict).toEqual({ action: 'reject', reason: 'verification_missing' });
      expect(fake.spy).not.toHaveBeenCalled();
    });

    it('accepts a valid token and passes IP and form action to the provider', async () => {
      const fake = verifier(true);
      const verdict = await humanVerificationCheck(fake, silent).check(
        submission({ verificationToken: 'tok' }),
      );

      expect(verdict).toEqual({ action: 'accept' });
      expect(fake.spy).toHaveBeenCalledWith({
        token: 'tok',
        remoteIp: '203.0.113.1',
        action: 'contact',
      });
    });

    it('rejects an invalid token', async () => {
      const verdict = await humanVerificationCheck(verifier(false), silent).check(
        submission({ verificationToken: 'bad' }),
      );
      expect(verdict).toEqual({ action: 'reject', reason: 'verification_failed' });
    });

    it('fails open (and warns) when the provider is unavailable', async () => {
      const logger = { warn: vi.fn() };
      const verdict = await humanVerificationCheck(verifier(new Error('timeout')), logger).check(
        submission({ verificationToken: 'tok' }),
      );

      expect(verdict).toEqual({ action: 'accept' });
      expect(logger.warn).toHaveBeenCalledOnce();
    });
  });

  describe('guard composition', () => {
    it('stops at the first non-accept verdict', async () => {
      const later = { name: 'later', check: vi.fn(() => ({ action: 'accept' }) as const) };
      const guard = createSpamGuard([honeypotCheck(), later]);

      const verdict = await guard.check(submission({ honeypot: 'x' }));
      expect(verdict.action).toBe('discard');
      expect(later.check).not.toHaveBeenCalled();
    });

    it('public-form guard skips human verification when no provider is configured', async () => {
      const guard = createPublicFormSpamGuard({ logger: silent });
      expect(await guard.check(submission())).toEqual({ action: 'accept' });
    });

    it('public-form guard requires a token when a provider is configured', async () => {
      const guard = createPublicFormSpamGuard({ humanVerifier: verifier(true), logger: silent });
      expect((await guard.check(submission())).action).toBe('reject');
    });

    it('public-form guard checks the honeypot before calling the provider', async () => {
      const fake = verifier(true);
      const guard = createPublicFormSpamGuard({ humanVerifier: fake, logger: silent });

      expect((await guard.check(submission({ honeypot: 'bot' }))).action).toBe('discard');
      expect(fake.spy).not.toHaveBeenCalled();
    });
  });
});
