import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Opaque bearer tokens for capability-style access (application status now,
 * scheduling links later).
 *
 * 32 random bytes (256 bits), base64url-encoded: 43 characters. Only the
 * SHA-256 hash is stored. Because the token is uniformly random and long, a
 * fast unsalted hash is sufficient: brute-forcing the preimage is infeasible,
 * and a database leak does not reveal usable tokens.
 */

const TOKEN_BYTES = 32;
export const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateAccessToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashAccessToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function isWellFormedAccessToken(value: string): boolean {
  return ACCESS_TOKEN_PATTERN.test(value);
}

/**
 * Extracts the token from an `Authorization: Bearer <token>` header. Returns
 * undefined when the header is missing or not a well-formed bearer token.
 * Tokens are never accepted from the query string (URLs end up in logs).
 */
export function parseBearerToken(header: string | undefined): string | undefined {
  if (header === undefined) return undefined;
  const match = /^Bearer ([^\s]+)$/i.exec(header.trim());
  const token = match?.[1];
  return token !== undefined && isWellFormedAccessToken(token) ? token : undefined;
}

/**
 * A value derived one-way from a token for another purpose (e.g. the booking
 * reference handed to a scheduling provider). Knowing the derived value does
 * not reveal the token, and the derivation can be repeated by anyone holding
 * the token, so the derived value never needs to be stored.
 */
export function deriveFromToken(token: string, purpose: string): string {
  return createHash('sha256').update(`phistream:${purpose}:${token}`, 'utf8').digest('base64url');
}

/** Hex HMAC-SHA256, as used by most webhook signature schemes. */
export function hmacSha256Hex(secret: string, payload: Buffer | string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time string comparison (length is not secret). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}
