import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'jose';

import type { StaffPrincipal } from '../../src/modules/admin/staff.repository.js';
import {
  createJwtStaffTokenVerifier,
  type StaffTokenVerifier,
} from '../../src/providers/auth/staff-token-verifier.js';

export const TEST_ISSUER = 'https://test-project.supabase.co/auth/v1';
export const TEST_AUDIENCE = 'authenticated';

/**
 * A local stand-in for Supabase Auth: an ES256 key pair published as a JWKS,
 * a verifier configured exactly like production (issuer, audience,
 * algorithms), and a helper that mints access tokens.
 */
export async function createTestStaffAuth() {
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256' };
  const verifier: StaffTokenVerifier = createJwtStaffTokenVerifier({
    key: createLocalJWKSet({ keys: [jwk] }),
    algorithms: ['ES256', 'RS256'],
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
  });

  async function tokenFor(
    subject: string,
    options: {
      claims?: JWTPayload;
      expiresIn?: string | number;
      issuer?: string;
      audience?: string;
    } = {},
  ): Promise<string> {
    return new SignJWT({ role: 'authenticated', ...options.claims })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setSubject(subject)
      .setIssuer(options.issuer ?? TEST_ISSUER)
      .setAudience(options.audience ?? TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(options.expiresIn ?? '1h')
      .sign(privateKey);
  }

  return { verifier, tokenFor, privateKey };
}

/** In-memory staff directory: subject → principal, honouring `isActive`. */
export function createFakeStaffDirectory(
  staff: (StaffPrincipal & { authProviderId: string; isActive: boolean })[],
) {
  return {
    staff,
    findActiveByAuthProviderId: (subject: string) =>
      Promise.resolve(
        staff
          .filter((s) => s.authProviderId === subject && s.isActive)
          .map(({ id, role, email, displayName }) => ({ id, role, email, displayName }))[0],
      ),
  };
}
