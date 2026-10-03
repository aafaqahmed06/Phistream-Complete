/**
 * Machine-readable error codes returned in the error envelope.
 * Add new codes deliberately; the frontend may branch on them.
 */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  /** Anti-spam human verification (e.g. a CAPTCHA token) failed; the user may retry. */
  'VERIFICATION_FAILED',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  /** The submitted form version is not the published one; reload the form. */
  'FORM_VERSION_OUTDATED',
  /** The same submission was already received recently. */
  'DUPLICATE_SUBMISSION',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'SERVICE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorDetail {
  /** Where the problem is, e.g. "body", "querystring", "params". */
  readonly location?: string;
  /** JSON pointer to the offending field, e.g. "/email". */
  readonly path?: string;
  readonly message: string;
}

/**
 * An expected, client-safe error raised by application code.
 *
 * `message` and `details` are returned to the caller verbatim, so they must
 * never contain secrets, PII, or internal state. Use `cause` for internals;
 * it is logged but never serialized into the response.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: readonly ErrorDetail[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}
