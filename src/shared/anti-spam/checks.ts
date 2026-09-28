import type { HumanVerifier } from './human-verifier.js';
import { ACCEPT, createSpamGuard, type SpamCheck, type SpamGuard } from './spam-guard.js';

/** A filled-in hidden field means an automated form filler. */
export function honeypotCheck(): SpamCheck {
  return {
    name: 'honeypot',
    check: ({ honeypot }) =>
      honeypot !== undefined && honeypot.trim() !== ''
        ? { action: 'discard', reason: 'honeypot' }
        : ACCEPT,
  };
}

const LINK_PATTERN = /\bhttps?:\/\/|\bwww\./gi;

/** Link-stuffed messages are the most common form of contact-form spam. */
export function linkLimitCheck(options: { maxLinks: number }): SpamCheck {
  return {
    name: 'link-limit',
    check: ({ freeText }) => {
      const links = freeText.reduce(
        (total, text) => total + (text.match(LINK_PATTERN)?.length ?? 0),
        0,
      );
      return links > options.maxLinks ? { action: 'discard', reason: 'too_many_links' } : ACCEPT;
    },
  };
}

export interface HumanVerificationLogger {
  warn(object: object, message: string): void;
}

/**
 * Requires a valid human-verification token.
 *
 * Fails OPEN when the provider itself is unavailable: losing real leads during
 * a provider outage is worse for the business than letting some spam through,
 * and the rate limit, honeypot and per-email caps still apply. The outage is
 * logged so it can be alerted on.
 */
export function humanVerificationCheck(
  verifier: HumanVerifier,
  logger: HumanVerificationLogger,
): SpamCheck {
  return {
    name: 'human-verification',
    async check({ verificationToken, remoteIp, form }) {
      if (verificationToken === undefined || verificationToken.trim() === '') {
        return { action: 'reject', reason: 'verification_missing' };
      }
      try {
        const result = await verifier.verify({ token: verificationToken, remoteIp, action: form });
        return result.success ? ACCEPT : { action: 'reject', reason: 'verification_failed' };
      } catch (error) {
        logger.warn(
          { err: error, provider: verifier.provider },
          'human verification unavailable; accepting submission (fail open)',
        );
        return ACCEPT;
      }
    },
  };
}

/** Link limit for public form free text (see linkLimitCheck). */
export const DEFAULT_MAX_LINKS = 5;

/**
 * Standard guard for public forms: honeypot, link limit, then the
 * human-verification provider when one is configured.
 */
export function createPublicFormSpamGuard(options: {
  humanVerifier?: HumanVerifier | undefined;
  logger: HumanVerificationLogger;
  maxLinks?: number;
}): SpamGuard {
  return createSpamGuard([
    honeypotCheck(),
    linkLimitCheck({ maxLinks: options.maxLinks ?? DEFAULT_MAX_LINKS }),
    ...(options.humanVerifier
      ? [humanVerificationCheck(options.humanVerifier, options.logger)]
      : []),
  ]);
}
