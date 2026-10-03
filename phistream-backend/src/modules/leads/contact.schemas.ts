import { z } from 'zod';

import {
  antiSpamFields,
  attributionFields,
  FIELD_LIMITS,
  multiLineText,
  personFields,
} from '../../shared/validation/fields.js';

/**
 * Public contact form contract. Shared field rules (and their limits, which
 * match the database CHECK constraints) live in src/shared/validation/fields.ts.
 */

export const CONTACT_LIMITS = {
  ...FIELD_LIMITS,
  message: 5000,
} as const;

/**
 * Upper bound for the whole JSON body. Generous for the field limits above
 * (a 5000-character message of escaped characters is ~30 KB) but far below the
 * global body limit.
 */
export const CONTACT_BODY_LIMIT_BYTES = 64 * 1024;

export const contactRequestSchema = z
  .strictObject({
    ...personFields,
    email: personFields.email.describe('Contact email address. Normalized to lowercase.'),
    message: multiLineText(1, CONTACT_LIMITS.message).describe(
      'Free-text message (line breaks allowed)',
    ),
    ...attributionFields,
    ...antiSpamFields,
  })
  .meta({ id: 'ContactRequest' });

export type ContactRequest = z.output<typeof contactRequestSchema>;

export const contactAcceptedResponseSchema = z
  .object({
    data: z.object({
      status: z.literal('RECEIVED'),
    }),
  })
  .meta({
    id: 'ContactAcceptedResponse',
    description:
      'Identical for every accepted submission, whether or not the email was already known.',
  });

export type ContactAcceptedResponse = z.infer<typeof contactAcceptedResponseSchema>;
