import { generateKeyPair, SignJWT, UnsecuredJWT } from 'jose';
import { describe, expect, it } from 'vitest';

import { loadConfig } from '../../src/config/env.js';
import {
  createJwtStaffTokenVerifier,
  createSupabaseStaffTokenVerifier,
  StaffAuthUnavailableError,
} from '../../src/providers/auth/staff-token-verifier.js';
import { createTestStaffAuth, TEST_AUDIENCE, TEST_ISSUER } from '../helpers/staff-auth.js';

const SUBJECT = '6a1f0f5e-0000-4000-8000-000000000001';

describe('staff token verifier', () => {
  it('accepts a valid token and returns only the subject', async () => {
    const { verifier, tokenFor } = await createTestStaffAuth();
    expect(await verifier.verify(await tokenFor(SUBJECT))).toEqual({ subject: SUBJECT });
  });

  it.each([
    ['expired', { expiresIn: Math.floor(Date.now() / 1000) - 60 }],
    ['from another issuer', { issuer: 'https://evil.supabase.co/auth/v1' }],
    ['for another audience', { audience: 'anon' }],
    ['with an anon role', { claims: { role: 'anon' } }],
    ['with a service_role role', { claims: { role: 'service_role' } }],
  ])('rejects a token %s', async (_, options) => {
    const { verifier, tokenFor } = await createTestStaffAuth();
    expect(await verifier.verify(await tokenFor(SUBJECT, options))).toBeUndefined();
  });

  it('rejects a token signed by another key', async () => {
    const { verifier } = await createTestStaffAuth();
    const other = await createTestStaffAuth();
    expect(await verifier.verify(await other.tokenFor(SUBJECT))).toBeUndefined();
  });

  it('rejects unsigned ("alg": "none") tokens', async () => {
    const { verifier } = await createTestStaffAuth();
    const unsigned = new UnsecuredJWT({ role: 'authenticated' })
      .setSubject(SUBJECT)
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('1h')
      .encode();
    expect(await verifier.verify(unsigned)).toBeUndefined();
  });

  it('rejects an HS256 token when only asymmetric algorithms are allowed', async () => {
    const { verifier } = await createTestStaffAuth();
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setSubject(SUBJECT)
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('x'.repeat(32)));
    expect(await verifier.verify(token)).toBeUndefined();
  });

  it('rejects a token without a subject', async () => {
    const { privateKey, verifier } = await createTestStaffAuth();
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    expect(await verifier.verify(token)).toBeUndefined();
  });

  it.each(['', 'not.a.jwt', 'a.b.c'])('rejects garbage %j', async (token) => {
    const { verifier } = await createTestStaffAuth();
    expect(await verifier.verify(token)).toBeUndefined();
  });

  it('throws StaffAuthUnavailableError when keys cannot be fetched', async () => {
    const { tokenFor } = await createTestStaffAuth();
    const verifier = createJwtStaffTokenVerifier({
      key: () => Promise.reject(new TypeError('fetch failed')),
      algorithms: ['ES256'],
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
    });
    await expect(verifier.verify(await tokenFor(SUBJECT))).rejects.toBeInstanceOf(
      StaffAuthUnavailableError,
    );
  });

  it('supports the legacy Supabase HS256 shared secret', async () => {
    const secret = 'legacy-jwt-secret-that-is-at-least-32-chars';
    const config = loadConfig({
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://test-project.supabase.co',
      SUPABASE_JWT_SECRET: secret,
    }).staffAuth;
    if (!config) throw new Error('staffAuth expected');
    const verifier = createSupabaseStaffTokenVerifier(config);
    const token = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(SUBJECT)
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(secret));

    expect(await verifier.verify(token)).toEqual({ subject: SUBJECT });

    // An asymmetric token is refused when the verifier expects HS256.
    const { privateKey } = await generateKeyPair('ES256');
    const es256 = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(SUBJECT)
      .setIssuer(TEST_ISSUER)
      .setAudience(TEST_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    expect(await verifier.verify(es256)).toBeUndefined();
  });
});

describe('staff auth configuration', () => {
  it('is disabled without SUPABASE_URL', () => {
    expect(loadConfig({ NODE_ENV: 'test' }).staffAuth).toBeUndefined();
  });

  it('derives issuer and JWKS URL from SUPABASE_URL', () => {
    expect(
      loadConfig({ NODE_ENV: 'test', SUPABASE_URL: 'https://abc.supabase.co' }).staffAuth,
    ).toEqual({
      issuer: 'https://abc.supabase.co/auth/v1',
      audience: 'authenticated',
      jwksUrl: 'https://abc.supabase.co/auth/v1/.well-known/jwks.json',
      jwtSecret: undefined,
    });
  });

  it.each([
    [{ SUPABASE_URL: 'https://abc.supabase.co/auth/v1' }, 'SUPABASE_URL'],
    [{ SUPABASE_URL: 'ftp://abc.supabase.co' }, 'SUPABASE_URL'],
    [{ SUPABASE_JWT_SECRET: 'x'.repeat(40) }, 'SUPABASE_URL'],
    [
      { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_JWT_SECRET: 'short' },
      'SUPABASE_JWT_SECRET',
    ],
  ])('rejects %j', (env, variable) => {
    expect(() => loadConfig({ NODE_ENV: 'test', ...env })).toThrow(variable);
  });

  it('never echoes the secret in configuration errors', () => {
    const secret = 'short-secret-value';
    try {
      loadConfig({
        NODE_ENV: 'test',
        SUPABASE_URL: 'https://a.supabase.co',
        SUPABASE_JWT_SECRET: secret,
      });
      throw new Error('expected a configuration error');
    } catch (error) {
      expect(String(error)).not.toContain(secret);
    }
  });

  it('requires https in production', () => {
    expect(() =>
      loadConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://u:p@db.example.com/app',
        CORS_ALLOWED_ORIGINS: 'https://example.com',
        SUPABASE_URL: 'http://abc.supabase.co',
      }),
    ).toThrow('SUPABASE_URL');
  });
});
