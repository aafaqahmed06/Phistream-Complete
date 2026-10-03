import { createRemoteJWKSet, errors, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from 'jose';

import type { StaffAuthConfig } from '../../config/env.js';

/**
 * Staff access-token verification (adapter). The admin API depends only on
 * `StaffTokenVerifier`; this file is the Supabase Auth implementation.
 *
 * A token proves only *who* the caller is (`sub`). Whether they are staff, and
 * with which role, is decided by our own `staff_users` table: claims such as
 * `role`/`app_metadata` are never trusted for authorization.
 */

export interface VerifiedStaffToken {
  /** Auth-provider user id (`sub`); matched to `staff_users.auth_provider_id`. */
  readonly subject: string;
}

export interface StaffTokenVerifier {
  /**
   * Resolves the verified identity, or undefined for any invalid token
   * (bad signature, expired, wrong issuer/audience/algorithm, malformed).
   * Rejects only when verification itself is unavailable (e.g. the JWKS
   * endpoint cannot be reached), so callers can answer 503 instead of 401.
   */
  verify(token: string): Promise<VerifiedStaffToken | undefined>;
}

export class StaffAuthUnavailableError extends Error {
  constructor(options?: ErrorOptions) {
    super('staff token verification is unavailable', options);
    this.name = 'StaffAuthUnavailableError';
  }
}

export interface JwtVerifierOptions {
  readonly key: Uint8Array | JWTVerifyGetKey;
  /** Explicit allow-list: "none" and unexpected algorithms are always refused. */
  readonly algorithms: readonly string[];
  readonly issuer: string;
  readonly audience: string;
  readonly clockToleranceSeconds?: number;
}

/** jose errors that mean "the provider could not be consulted", not "bad token". */
function isUnavailable(error: unknown): boolean {
  return (
    !(error instanceof errors.JOSEError) ||
    error instanceof errors.JWKSTimeout ||
    error instanceof errors.JWKSInvalid
  );
}

export function createJwtStaffTokenVerifier(options: JwtVerifierOptions): StaffTokenVerifier {
  const verifyOptions = {
    algorithms: [...options.algorithms],
    issuer: options.issuer,
    audience: options.audience,
    clockTolerance: options.clockToleranceSeconds ?? 5,
    requiredClaims: ['sub', 'exp', 'iat'],
  };

  return {
    async verify(token) {
      let payload: JWTPayload;
      try {
        const result =
          options.key instanceof Uint8Array
            ? await jwtVerify(token, options.key, verifyOptions)
            : await jwtVerify(token, options.key, verifyOptions);
        payload = result.payload;
      } catch (error) {
        if (isUnavailable(error)) throw new StaffAuthUnavailableError({ cause: error });
        return undefined;
      }
      // Supabase issues `role: "authenticated"` to signed-in users; anon and
      // service keys carry other roles (and another issuer).
      if (payload.role !== 'authenticated') return undefined;
      if (typeof payload.sub !== 'string' || payload.sub === '') return undefined;
      return { subject: payload.sub };
    },
  };
}

/**
 * Supabase Auth: asymmetric signing keys via the project's JWKS (ES256/RS256),
 * or the legacy HS256 shared secret when configured. The JWKS is fetched
 * lazily and cached by jose; a timeout keeps a slow provider from hanging
 * admin requests.
 */
export function createSupabaseStaffTokenVerifier(config: StaffAuthConfig): StaffTokenVerifier {
  const base = { issuer: config.issuer, audience: config.audience };
  if (config.jwtSecret !== undefined) {
    return createJwtStaffTokenVerifier({
      ...base,
      key: new TextEncoder().encode(config.jwtSecret),
      algorithms: ['HS256'],
    });
  }
  return createJwtStaffTokenVerifier({
    ...base,
    key: createRemoteJWKSet(new URL(config.jwksUrl), { timeoutDuration: 3000 }),
    algorithms: ['ES256', 'RS256'],
  });
}
