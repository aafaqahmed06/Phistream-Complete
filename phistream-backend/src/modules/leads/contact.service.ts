import type { SpamGuard } from '../../shared/anti-spam/spam-guard.js';
import { AppError } from '../../shared/errors/app-error.js';
import { resolveLead } from './lead-resolution.js';
import type { LeadsRepository } from './leads.repository.js';

/**
 * Contact form handling: spam screening, lead deduplication, and the internal
 * notification event. Framework-free; the route only parses and delegates.
 *
 * Deduplication policy (per normalized email, applied under a per-email lock):
 *
 * 1. Same message from the same email within `duplicateWindowMs`
 *    → DUPLICATE: nothing is written (double submits, retries, replays).
 * 2. `maxSubmissionsPerEmail` or more submissions within `floodWindowMs`
 *    → THROTTLED: nothing is written (stops notification flooding and
 *    storage abuse through a single address, even across many IPs).
 * 3. Otherwise the submission is attached to a lead per `resolveLead`
 *    (lead-resolution.ts): the latest open lead for the email, with blank
 *    fields filled in but never overwritten, or a new lead when there is none
 *    or the latest one is closed.
 *
 * Every recorded submission enqueues one CONTACT_RECEIVED notification event
 * in the same transaction.
 *
 * The caller receives the same response for every outcome except a failed
 * human verification, so the endpoint cannot be used to discover which emails
 * are known.
 */

export interface ContactPolicy {
  readonly duplicateWindowMs: number;
  readonly floodWindowMs: number;
  readonly maxSubmissionsPerEmail: number;
}

export const DEFAULT_CONTACT_POLICY: ContactPolicy = {
  duplicateWindowMs: 24 * 60 * 60 * 1000,
  floodWindowMs: 60 * 60 * 1000,
  maxSubmissionsPerEmail: 5,
};

export interface ContactSubmissionInput {
  readonly name: string;
  /** Already normalized (trimmed, lowercase) by the request schema. */
  readonly email: string;
  readonly phone?: string | undefined;
  readonly companyName?: string | undefined;
  readonly message: string;
  readonly source?: string | undefined;
  readonly campaign?: string | undefined;
}

export interface ContactRequestContext {
  readonly remoteIp: string;
  readonly honeypot?: string | undefined;
  readonly verificationToken?: string | undefined;
}

export type ContactOutcome =
  | {
      readonly outcome: 'RECORDED';
      readonly leadId: string;
      readonly submissionId: string;
      readonly leadCreated: boolean;
    }
  | { readonly outcome: 'DUPLICATE' }
  | { readonly outcome: 'THROTTLED' }
  | { readonly outcome: 'DISCARDED'; readonly reason: string };

export interface ContactService {
  /**
   * Resolves for every outcome except a failed human verification, which
   * throws `AppError(400, 'VERIFICATION_FAILED')`. The outcome is for logging
   * and tests; it must not be exposed to the caller.
   */
  submit(input: ContactSubmissionInput, context: ContactRequestContext): Promise<ContactOutcome>;
}

export interface ContactServiceLogger {
  info(object: object, message: string): void;
}

export function createContactService(deps: {
  repository: LeadsRepository;
  spamGuard: SpamGuard;
  logger: ContactServiceLogger;
  policy?: ContactPolicy;
  now?: () => Date;
}): ContactService {
  const { repository, spamGuard, logger } = deps;
  const policy = deps.policy ?? DEFAULT_CONTACT_POLICY;
  const now = deps.now ?? (() => new Date());

  async function record(input: ContactSubmissionInput): Promise<ContactOutcome> {
    const at = now().getTime();
    const phone = input.phone ?? null;
    const companyName = input.companyName ?? null;
    const source = input.source ?? null;
    const campaign = input.campaign ?? null;

    return repository.withEmailLock(input.email, async (tx) => {
      const activity = await tx.getSubmissionActivity(input.email, {
        countSince: new Date(at - policy.floodWindowMs),
        duplicateSince: new Date(at - policy.duplicateWindowMs),
        message: input.message,
      });
      if (activity.hasIdenticalMessage) return { outcome: 'DUPLICATE' };
      if (activity.recentCount >= policy.maxSubmissionsPerEmail) return { outcome: 'THROTTLED' };

      const { leadId, leadCreated } = await resolveLead(tx, {
        email: input.email,
        fullName: input.name,
        phone,
        companyName,
        source,
        campaign,
      });

      const submissionId = await tx.insertContactSubmission({
        leadId,
        fullName: input.name,
        phone,
        companyName,
        message: input.message,
        source,
        campaign,
      });
      await tx.enqueueNotificationEvent({
        eventType: 'CONTACT_RECEIVED',
        subjectType: 'contact_submission',
        subjectId: submissionId,
      });

      return { outcome: 'RECORDED', leadId, submissionId, leadCreated };
    });
  }

  return {
    async submit(input, context) {
      const verdict = await spamGuard.check({
        form: 'contact',
        remoteIp: context.remoteIp,
        honeypot: context.honeypot,
        verificationToken: context.verificationToken,
        freeText: [input.message],
      });

      if (verdict.action === 'reject') {
        logger.info({ outcome: 'REJECTED', reason: verdict.reason }, 'contact submission rejected');
        throw new AppError(
          400,
          'VERIFICATION_FAILED',
          'We could not verify this submission. Please complete the verification and try again.',
        );
      }

      const result: ContactOutcome =
        verdict.action === 'discard'
          ? { outcome: 'DISCARDED', reason: verdict.reason }
          : await record(input);

      // Identifiers and classifications only: never names, emails, or messages.
      logger.info(result, 'contact submission processed');
      return result;
    },
  };
}
