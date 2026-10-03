import type { FastifyLoggerOptions } from 'fastify';
import type { LoggerOptions } from 'pino';

import type { AppConfig } from '../../config/env.js';
import { serializeError } from './error-serializer.js';

/**
 * Request fields worth logging. Headers, query strings, and bodies are
 * deliberately excluded: they can carry tokens or personal data (e.g. contact
 * and eligibility submissions).
 */
function serializeRequest(request: { method: string; url: string }) {
  const queryStart = request.url.indexOf('?');
  return {
    method: request.method,
    url: queryStart === -1 ? request.url : request.url.slice(0, queryStart),
  };
}

function serializeResponse(reply: { statusCode: number }) {
  return { statusCode: reply.statusCode };
}

export function buildLoggerOptions(config: AppConfig): FastifyLoggerOptions & LoggerOptions {
  return {
    level: config.logging.level,
    base: { service: 'phistream-backend', env: config.env },
    // `err` drops query parameters and row details that database errors carry.
    serializers: { req: serializeRequest, res: serializeResponse, err: serializeError },
    // Defense in depth in case headers/credentials are ever logged explicitly.
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'headers.authorization',
        'headers.cookie',
        '*.password',
        '*.token',
        '*.apiKey',
        '*.secret',
      ],
      censor: '[REDACTED]',
    },
    ...(config.logging.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname,service,env' },
          },
        }
      : {}),
  };
}
