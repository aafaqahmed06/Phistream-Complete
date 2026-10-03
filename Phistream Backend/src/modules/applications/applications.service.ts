import { randomUUID } from 'node:crypto';

import type { SpamGuard } from '../../shared/anti-spam/spam-guard.js';
import { AppError, type ErrorDetail } from '../../shared/errors/app-error.js';
import {
  generateAccessToken,
  hashAccessToken,
  isWellFormedAccessToken,
} from '../../shared/security/access-tokens.js';
import { resolveLead } from '../leads/lead-resolution.js';
import {
  buildAnswersSchema,
  formDefinitionSchema,
  type ApplicationForm,
  type ValidatedAnswers,
} from './application-form.js';
import { generateReference, submissionFingerprint } from './application-identifiers.js';
import { toPublicStatus, type PublicApplicationStatus } from './application-status.js';
import type { ApplicationsRepository } from './applications.repository.js';

/**
 * Eligibility application submission and applicant status lookup.
 * Framework-free; routes only parse and delegate.
 *
 * Submission, in order:
 *  1. Spam guard (honeypot, human verification when configured).
 *  2. The form version must be the ACTIVE one (else 409 FORM_VERSION_OUTDATED).
 *  3. Answers are validated against that version's questions.
 *  4. The service tier, if given, must be an active tier.
 *  5. Under the per-email lock (shared with the contact flow):
 *     - same fingerprint within `duplicateWindowMs` → 409 DUPLICATE_SUBMISSION
 *     - `maxApplicationsPerEmail` within `capWindowMs` → 429 RATE_LIMITED
 *     - lead resolved (lead-resolution.ts), application + answers +
 *       SUBMITTED event + status token + APPLICATION_SUBMITTED notification
 *       written in one transaction.
 *  6. The raw status token is returned once; only its hash is stored.
 *
 * Several applications per lead are allowed (DATA_MODEL.md): reviewers see
 * them together.
 */

export interface ApplicationPolicy {
  readonly duplicateWindowMs: number;
  readonly capWindowMs: number;
  readonly maxApplicationsPerEmail: number;
  readonly statusTokenTtlMs: number;
}

export const DEFAULT_APPLICATION_POLICY: Omit<ApplicationPolicy, 'statusTokenTtlMs'> = {
  duplicateWindowMs: 60 * 60 * 1000,
  capWindowMs: 24 * 60 * 60 * 1000,
  maxApplicationsPerEmail: 3,
};

export interface ApplicationSubmissionInput {
  readonly formVersion: string;
  readonly serviceTierSlug?: string | undefined;
  readonly name: string;
  /** Normalized (trimmed, lowercase) by the request schema. */
  readonly email: string;
  readonly phone?: string | undefined;
  readonly companyName?: string | undefined;
  readonly source?: string | undefined;
  readonly campaign?: string | undefined;
  readonly answers: Readonly<Record<string, unknown>>;
}

export interface SubmissionContext {
  readonly remoteIp: string;
  readonly honeypot?: string | undefined;
  readonly verificationToken?: string | undefined;
}

export interface SubmittedApplication {
  readonly id: string;
  readonly reference: string;
  readonly statusAccess: { readonly token: string; readonly expiresAt: Date };
}

export interface ApplicationStatusView {
  readonly reference: string;
  readonly status: PublicApplicationStatus;
  readonly submittedAt: Date;
}

export interface ApplicationsService {
  /** The ACTIVE form version. 404 NOT_FOUND when none is published. */
  getActiveForm(): Promise<ApplicationForm>;
  submit(
    input: ApplicationSubmissionInput,
    context: SubmissionContext,
  ): Promise<SubmittedApplication>;
  /**
   * Public status for the holder of a valid status token. Missing/malformed
   * token → 401; anything else invalid (unknown id, wrong/expired/revoked
   * token, another application's token) → the same 404.
   */
  getStatus(applicationId: string, token: string | undefined): Promise<ApplicationStatusView>;
}

export interface ApplicationsServiceLogger {
  info(object: object, message: string): void;
  error(object: object, message: string): void;
}

const MAX_REFERENCE_ATTEMPTS = 5;

function validationError(details: ErrorDetail[]): AppError {
  return new AppError(400, 'VALIDATION_ERROR', 'The submitted data is invalid.', details);
}

export function createApplicationsService(deps: {
  repository: ApplicationsRepository;
  spamGuard: SpamGuard;
  logger: ApplicationsServiceLogger;
  policy: Pick<ApplicationPolicy, 'statusTokenTtlMs'> & Partial<ApplicationPolicy>;
  now?: () => Date;
}): ApplicationsService {
  const { repository, spamGuard, logger } = deps;
  const policy: ApplicationPolicy = { ...DEFAULT_APPLICATION_POLICY, ...deps.policy };
  const now = deps.now ?? (() => new Date());

  async function loadActiveForm(): Promise<ApplicationForm | undefined> {
    const stored = await repository.findActiveForm();
    if (!stored) return undefined;
    const parsed = formDefinitionSchema.safeParse(stored.definition);
    if (!parsed.success) {
      // A broken definition must not be served or accepted; staff must publish
      // a corrected version. Version only: definitions are business content.
      logger.error(
        { formVersion: stored.version },
        'active application form definition is invalid',
      );
      return undefined;
    }
    return { version: stored.version, definition: parsed.data };
  }

  function validateAnswers(form: ApplicationForm, answers: unknown): ValidatedAnswers {
    const parsed = buildAnswersSchema(form.definition).safeParse(answers);
    if (parsed.success) return parsed.data;
    // Paths and validator messages only; submitted values are never echoed.
    throw validationError(
      parsed.error.issues.map((issue) => ({
        location: 'body',
        path: `/answers${issue.path.length > 0 ? `/${issue.path.map(String).join('/')}` : ''}`,
        message: issue.code === 'unrecognized_keys' ? 'Unknown question key' : issue.message,
      })),
    );
  }

  function issueStatusToken(at: Date) {
    const token = generateAccessToken();
    return {
      token,
      tokenHash: hashAccessToken(token),
      expiresAt: new Date(at.getTime() + policy.statusTokenTtlMs),
    };
  }

  return {
    async getActiveForm() {
      const form = await loadActiveForm();
      if (!form)
        throw new AppError(404, 'NOT_FOUND', 'No application form is currently published.');
      return form;
    },

    async submit(input, context) {
      const verdict = await spamGuard.check({
        form: 'application',
        remoteIp: context.remoteIp,
        honeypot: context.honeypot,
        verificationToken: context.verificationToken,
        // Answers may legitimately contain links (portfolio, social profiles),
        // so they are not screened for link density.
        freeText: [],
      });
      if (verdict.action === 'reject') {
        logger.info({ outcome: 'REJECTED', reason: verdict.reason }, 'application rejected');
        throw new AppError(
          400,
          'VERIFICATION_FAILED',
          'We could not verify this submission. Please complete the verification and try again.',
        );
      }
      const at = now();
      if (verdict.action === 'discard') {
        // Indistinguishable from success for the bot; nothing is stored, so the
        // returned id/token lead nowhere (status lookups get the usual 404).
        logger.info({ outcome: 'DISCARDED', reason: verdict.reason }, 'application discarded');
        const { token, expiresAt } = issueStatusToken(at);
        return {
          id: randomUUID(),
          reference: generateReference(at),
          statusAccess: { token, expiresAt },
        };
      }

      const form = await loadActiveForm();
      if (!form) {
        throw new AppError(503, 'SERVICE_UNAVAILABLE', 'Applications are not open at the moment.');
      }
      if (input.formVersion !== form.version) {
        logger.info({ outcome: 'FORM_VERSION_OUTDATED' }, 'application rejected');
        throw new AppError(
          409,
          'FORM_VERSION_OUTDATED',
          'The application form has changed. Please reload it and submit again.',
        );
      }
      const answers = validateAnswers(form, input.answers);

      let serviceTierId: string | null = null;
      if (input.serviceTierSlug !== undefined) {
        serviceTierId = (await repository.findActiveServiceTierId(input.serviceTierSlug)) ?? null;
        if (serviceTierId === null) {
          // Unknown and inactive tiers are indistinguishable.
          throw validationError([
            { location: 'body', path: '/serviceTierSlug', message: 'is not an available service' },
          ]);
        }
      }

      const fingerprint = submissionFingerprint({
        email: input.email,
        formVersion: form.version,
        serviceTierId,
        answers,
      });
      const access = issueStatusToken(at);

      const result = await repository.withEmailLock(input.email, async (tx) => {
        const activity = await tx.getApplicationActivity(input.email, {
          countSince: new Date(at.getTime() - policy.capWindowMs),
          duplicateSince: new Date(at.getTime() - policy.duplicateWindowMs),
          fingerprint,
        });
        if (activity.hasDuplicate) {
          throw new AppError(
            409,
            'DUPLICATE_SUBMISSION',
            'This application has already been submitted.',
          );
        }
        if (activity.recentCount >= policy.maxApplicationsPerEmail) {
          throw new AppError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.');
        }

        const lead = await resolveLead(tx, {
          email: input.email,
          fullName: input.name,
          phone: input.phone ?? null,
          companyName: input.companyName ?? null,
          source: input.source ?? null,
          campaign: input.campaign ?? null,
        });

        let reference: string | undefined;
        let applicationId: string | undefined;
        for (let attempt = 0; attempt < MAX_REFERENCE_ATTEMPTS && !applicationId; attempt++) {
          reference = generateReference(at);
          applicationId = await tx.insertApplication({
            reference,
            leadId: lead.leadId,
            serviceTierId,
            formVersion: form.version,
            submissionFingerprint: fingerprint,
            source: input.source ?? null,
            campaign: input.campaign ?? null,
          });
        }
        if (!applicationId || !reference) {
          throw new Error('could not allocate a unique application reference');
        }

        await tx.insertAnswers(applicationId, answers);
        await tx.insertEvent({
          applicationId,
          eventType: 'SUBMITTED',
          actorType: 'APPLICANT',
          actorId: null,
          metadata: { formVersion: form.version },
        });
        await tx.insertAccessToken({
          applicationId,
          purpose: 'STATUS',
          tokenHash: access.tokenHash,
          expiresAt: access.expiresAt,
        });
        await tx.enqueueNotificationEvent({
          eventType: 'APPLICATION_SUBMITTED',
          subjectType: 'application',
          subjectId: applicationId,
        });
        return { applicationId, reference, ...lead };
      });

      // Identifiers only: never contact details, answers, or the token.
      logger.info(
        {
          outcome: 'SUBMITTED',
          applicationId: result.applicationId,
          leadId: result.leadId,
          leadCreated: result.leadCreated,
          formVersion: form.version,
        },
        'application submitted',
      );
      return {
        id: result.applicationId,
        reference: result.reference,
        statusAccess: { token: access.token, expiresAt: access.expiresAt },
      };
    },

    async getStatus(applicationId, token) {
      if (token === undefined || !isWellFormedAccessToken(token)) {
        throw new AppError(401, 'UNAUTHORIZED', 'A valid status token is required.');
      }
      const row = await repository.findStatusByAccessToken({
        applicationId,
        tokenHash: hashAccessToken(token),
        purpose: 'STATUS',
        now: now(),
      });
      if (!row) throw new AppError(404, 'NOT_FOUND', 'Application not found.');
      return {
        reference: row.reference,
        status: toPublicStatus(row.status),
        submittedAt: row.submittedAt,
      };
    },
  };
}
