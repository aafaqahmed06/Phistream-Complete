import { z } from 'zod';

import {
  antiSpamFields,
  attributionFields,
  optional,
  personFields,
} from '../../shared/validation/fields.js';
import { SLUG_PATTERN } from '../content/content.schemas.js';
import {
  FORM_LIMITS,
  FORM_VERSION_PATTERN,
  QUESTION_KEY_PATTERN,
  questionSchema,
} from './application-form.js';
import { PUBLIC_APPLICATION_STATUSES } from './application-status.js';

/**
 * Public applications contract. Answers are validated in two steps: their
 * shape here (an object keyed by question key), their content in the service
 * against the ACTIVE form version's questions.
 */

/** Generous for 50 questions of up to 5000 characters each. */
export const APPLICATION_BODY_LIMIT_BYTES = 256 * 1024;

// ---- Form -------------------------------------------------------------------------

export const publicFormQuestionSchema = questionSchema.meta({
  id: 'ApplicationFormQuestion',
  description:
    'One question. `type` decides the answer shape: text/url → string, number → number, single_choice → option value, multiple_choice → array of option values, boolean → true/false.',
});

export const applicationFormResponseSchema = z.object({
  data: z
    .object({
      version: z.string().describe('Send back as `formVersion` when submitting.'),
      title: z.string().nullable(),
      description: z.string().nullable(),
      questions: z.array(publicFormQuestionSchema),
    })
    .meta({ id: 'ApplicationForm' }),
});

export type ApplicationFormResponse = z.infer<typeof applicationFormResponseSchema>;

// ---- Submission ---------------------------------------------------------------------

export const applicationRequestSchema = z
  .strictObject({
    formVersion: z
      .string()
      .regex(FORM_VERSION_PATTERN, 'is not a valid form version')
      .describe('The `version` from GET /applications/form.'),
    serviceTierSlug: optional(
      z.string().max(100).regex(SLUG_PATTERN, 'is not a valid service slug'),
    ).describe('Slug of an active service tier, if the applicant chose one.'),
    ...personFields,
    ...attributionFields,
    answers: z
      .record(z.string().regex(QUESTION_KEY_PATTERN, 'is not a valid question key'), z.unknown())
      .refine((answers) => Object.keys(answers).length <= FORM_LIMITS.questions, {
        error: `must not contain more than ${FORM_LIMITS.questions} answers`,
      })
      .describe(
        'Answers keyed by question `key`. Unknown keys are rejected; blank/null means unanswered.',
      ),
    ...antiSpamFields,
  })
  .meta({ id: 'ApplicationSubmission' });

export type ApplicationRequest = z.output<typeof applicationRequestSchema>;

export const applicationCreatedResponseSchema = z
  .object({
    data: z.object({
      application: z.object({
        id: z.uuid(),
        reference: z.string().describe('Human-friendly reference. Not a credential.'),
      }),
      nextStep: z.literal('UNDER_REVIEW'),
      statusAccess: z
        .object({
          token: z
            .string()
            .describe(
              'Secret bearer token for GET /applications/{id}/status. Returned only once; keep it client-side (never in URLs).',
            ),
          expiresAt: z.iso.datetime(),
        })
        .meta({ id: 'ApplicationStatusAccess' }),
    }),
  })
  .meta({ id: 'ApplicationCreatedResponse' });

export type ApplicationCreatedResponse = z.infer<typeof applicationCreatedResponseSchema>;

// ---- Status -------------------------------------------------------------------------

export const applicationIdParamsSchema = z.object({ id: z.uuid() });

export const applicationStatusResponseSchema = z
  .object({
    data: z.object({
      reference: z.string(),
      status: z.enum(PUBLIC_APPLICATION_STATUSES),
      submittedAt: z.iso.datetime(),
    }),
  })
  .meta({ id: 'ApplicationStatusResponse' });

export type ApplicationStatusResponse = z.infer<typeof applicationStatusResponseSchema>;
