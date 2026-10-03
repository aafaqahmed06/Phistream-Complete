import { z } from 'zod';

import { ERROR_CODES, type ErrorCode, type ErrorDetail } from './app-error.js';

export const errorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.enum(ERROR_CODES),
      message: z.string(),
      requestId: z.string(),
      details: z
        .array(
          z.object({
            location: z.string().optional(),
            path: z.string().optional(),
            message: z.string(),
          }),
        )
        .optional(),
    }),
  })
  .meta({ id: 'ErrorEnvelope', description: 'Standard error response' });

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export function toErrorEnvelope(input: {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: readonly ErrorDetail[] | undefined;
}): ErrorEnvelope {
  const { code, message, requestId, details } = input;
  return {
    error: {
      code,
      message,
      requestId,
      ...(details && details.length > 0 ? { details: [...details] } : {}),
    },
  };
}

/** Response schemas to attach to every route so OpenAPI documents the envelope. */
export const errorResponses = {
  '4xx': errorEnvelopeSchema,
  '5xx': errorEnvelopeSchema,
} as const;
