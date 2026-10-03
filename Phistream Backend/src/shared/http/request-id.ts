import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Incoming IDs are accepted only when they match a conservative pattern, so an
 * upstream proxy/frontend can correlate logs without enabling log injection.
 */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function generateRequestId(request: IncomingMessage): string {
  const incoming = request.headers[REQUEST_ID_HEADER];
  if (typeof incoming === 'string' && SAFE_REQUEST_ID.test(incoming)) return incoming;
  return randomUUID();
}
