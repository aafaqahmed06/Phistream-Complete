import { describe, expect, it } from 'vitest';

import {
  generateAccessToken,
  hashAccessToken,
  parseBearerToken,
} from '../../src/shared/security/access-tokens.js';

describe('access tokens', () => {
  it('generates distinct 256-bit base64url tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateAccessToken));
    expect(tokens.size).toBe(100);
    for (const token of tokens) expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('hashes deterministically to hex SHA-256, never returning the token', () => {
    const token = generateAccessToken();
    expect(hashAccessToken(token)).toBe(hashAccessToken(token));
    expect(hashAccessToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAccessToken(token)).not.toContain(token);
  });

  it('parses Bearer headers (case-insensitive scheme)', () => {
    const token = generateAccessToken();
    expect(parseBearerToken(`Bearer ${token}`)).toBe(token);
    expect(parseBearerToken(`bearer ${token}`)).toBe(token);
  });

  it.each([
    undefined,
    '',
    'Bearer',
    'Bearer ',
    'Basic dXNlcjpwYXNz',
    'Bearer short',
    `Bearer ${'a'.repeat(44)}`,
    `Bearer ${'a'.repeat(42)}!`,
    `Bearer ${'a'.repeat(43)} extra`,
    `Token ${'a'.repeat(43)}`,
  ])('rejects %j', (header) => {
    expect(parseBearerToken(header)).toBeUndefined();
  });
});
