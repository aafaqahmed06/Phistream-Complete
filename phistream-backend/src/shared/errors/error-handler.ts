import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { isResponseSerializationError } from 'fastify-type-provider-zod';

import { REQUEST_ID_HEADER } from '../http/request-id.js';
import { AppError, type ErrorCode, type ErrorDetail } from './app-error.js';
import { toErrorEnvelope } from './error-envelope.js';

interface ResolvedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: readonly ErrorDetail[];
}

const INTERNAL_ERROR: ResolvedError = {
  statusCode: 500,
  code: 'INTERNAL_ERROR',
  message: 'An unexpected error occurred.',
};

/** Fastify-internal error codes that deserve a specific envelope code. */
const FASTIFY_CODE_MAP: Readonly<Record<string, Omit<ResolvedError, 'details'>>> = {
  FST_ERR_CTP_BODY_TOO_LARGE: {
    statusCode: 413,
    code: 'PAYLOAD_TOO_LARGE',
    message: 'The request body is too large.',
  },
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    statusCode: 415,
    code: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'The request content type is not supported.',
  },
  FST_ERR_CTP_INVALID_JSON_BODY: {
    statusCode: 400,
    code: 'BAD_REQUEST',
    message: 'The request body is not valid JSON.',
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: {
    statusCode: 400,
    code: 'BAD_REQUEST',
    message: 'The request body must not be empty.',
  },
};

/**
 * Generic messages by status. Framework/library error messages are never
 * echoed to clients: some (e.g. JSON parse errors) embed fragments of the
 * request body, which may contain PII.
 */
const STATUS_MAP: Readonly<Record<number, Omit<ResolvedError, 'statusCode' | 'details'>>> = {
  400: { code: 'BAD_REQUEST', message: 'The request is invalid.' },
  401: { code: 'UNAUTHORIZED', message: 'Authentication is required.' },
  403: { code: 'FORBIDDEN', message: 'You do not have permission to perform this action.' },
  404: { code: 'NOT_FOUND', message: 'The requested resource was not found.' },
  405: { code: 'METHOD_NOT_ALLOWED', message: 'The request method is not allowed.' },
  409: { code: 'CONFLICT', message: 'The request conflicts with the current state.' },
  413: { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.' },
  414: { code: 'BAD_REQUEST', message: 'The request URL is too long.' },
  415: { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'The request content type is not supported.' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' },
  503: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
};

function resolveError(error: FastifyError | Error): ResolvedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    };
  }

  if (isResponseSerializationError(error)) return INTERNAL_ERROR;

  const fastifyError = error as Partial<FastifyError>;

  if (Array.isArray(fastifyError.validation)) {
    // Only field locations and validator messages are returned — never the
    // submitted values.
    const location = fastifyError.validationContext;
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'The submitted data is invalid.',
      details: fastifyError.validation.map((issue) => ({
        ...(location ? { location } : {}),
        path: issue.instancePath || '/',
        message: issue.message ?? 'Invalid value',
      })),
    };
  }

  const mapped = fastifyError.code ? FASTIFY_CODE_MAP[fastifyError.code] : undefined;
  if (mapped) return mapped;

  const statusCode = fastifyError.statusCode;
  if (statusCode !== undefined) {
    const byStatus = STATUS_MAP[statusCode];
    if (byStatus) return { statusCode, ...byStatus };
    if (statusCode >= 400 && statusCode < 500) {
      return { statusCode, code: 'BAD_REQUEST', message: 'The request is invalid.' };
    }
  }

  return INTERNAL_ERROR;
}

export function errorHandler(
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  const resolved = resolveError(error);

  if (resolved.statusCode >= 500) {
    request.log.error({ err: error }, 'request failed with server error');
  } else {
    // Client errors are expected; log the classification only (no payloads).
    request.log.info(
      { statusCode: resolved.statusCode, errorCode: resolved.code },
      'request rejected',
    );
  }

  // Set here too: router-level errors are raised before any hook runs.
  reply.header(REQUEST_ID_HEADER, request.id);
  return reply.status(resolved.statusCode).send(
    toErrorEnvelope({
      code: resolved.code,
      message: resolved.message,
      requestId: request.id,
      details: resolved.details,
    }),
  );
}

export function notFoundHandler(request: FastifyRequest, reply: FastifyReply): FastifyReply {
  return reply.status(404).send(
    toErrorEnvelope({
      code: 'NOT_FOUND',
      message: 'Route not found.',
      requestId: request.id,
    }),
  );
}
