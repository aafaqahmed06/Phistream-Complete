import type { IncomingMessage } from 'node:http';

import { describe, expect, it } from 'vitest';

import { generateRequestId } from '../../src/shared/http/request-id.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function requestWith(headers: IncomingMessage['headers']): IncomingMessage {
  return { headers } as IncomingMessage;
}

describe('generateRequestId', () => {
  it('generates a UUID when no header is present', () => {
    expect(generateRequestId(requestWith({}))).toMatch(UUID);
  });

  it('generates unique IDs', () => {
    expect(generateRequestId(requestWith({}))).not.toBe(generateRequestId(requestWith({})));
  });

  it('reuses a well-formed incoming x-request-id', () => {
    expect(generateRequestId(requestWith({ 'x-request-id': 'edge-abc123.456' }))).toBe(
      'edge-abc123.456',
    );
  });

  it.each(['short', 'has spaces in it', 'line\nbreak-injection', 'x'.repeat(129)])(
    'ignores an unsafe incoming id %#',
    (value) => {
      expect(generateRequestId(requestWith({ 'x-request-id': value }))).toMatch(UUID);
    },
  );
});
