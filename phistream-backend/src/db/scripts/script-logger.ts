import { pino } from 'pino';

import { serializeError } from '../../shared/logging/error-serializer.js';

/** Structured logger for one-off database scripts (same JSON shape as the API). */
export function createScriptLogger(script: string) {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    base: { service: 'phistream-backend', script },
    // Same PII-safe error serializer as the API (drops query parameters).
    serializers: { err: serializeError },
  });
}

/** Host and database name only — never credentials. */
export function describeDatabaseUrl(url: string): { host: string; database: string } {
  const parsed = new URL(url);
  return { host: parsed.host, database: parsed.pathname.replace(/^\//, '') };
}
