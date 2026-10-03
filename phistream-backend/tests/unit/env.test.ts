import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig, loadDatabaseConfig } from '../../src/config/env.js';

const DB_URL = 'postgres://user:secret-password@localhost:5432/app';

/** Minimal valid environment plus overrides. */
function load(env: Record<string, string> = {}) {
  return loadConfig({ DATABASE_URL: DB_URL, ...env });
}

function configError(env: Record<string, string>, withDatabase = true): ConfigError {
  try {
    loadConfig(withDatabase ? { DATABASE_URL: DB_URL, ...env } : env);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('expected loadConfig to throw');
}

function hasIssue(error: ConfigError, key: string): boolean {
  return error.issues.some((issue) => issue.startsWith(`${key}:`));
}

describe('loadConfig', () => {
  it('applies safe defaults for a minimal development environment', () => {
    const config = load();
    expect(config.env).toBe('development');
    expect(config.isProduction).toBe(false);
    expect(config.server).toEqual({
      host: '0.0.0.0',
      port: 3000,
      trustProxy: false,
      bodyLimitBytes: 102_400,
      shutdownTimeoutMs: 10_000,
      requestTimeoutMs: 30_000,
    });
    expect(config.cors.allowedOrigins).toEqual([]);
    expect(config.rateLimit).toEqual({ max: 100, windowMs: 60_000 });
    expect(config.docs.enabled).toBe(true);
  });

  it('treats empty strings as unset', () => {
    expect(load({ PORT: '', LOG_LEVEL: ' ' }).server.port).toBe(3000);
  });

  it('coerces numeric values', () => {
    const config = load({ PORT: '8080', RATE_LIMIT_MAX: '5', BODY_LIMIT_BYTES: '2048' });
    expect(config.server.port).toBe(8080);
    expect(config.rateLimit.max).toBe(5);
    expect(config.server.bodyLimitBytes).toBe(2048);
  });

  it.each([
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['NODE_ENV', 'staging'],
    ['LOG_LEVEL', 'verbose'],
    ['LOG_PRETTY', 'yes'],
    ['BODY_LIMIT_BYTES', '10'],
    ['RATE_LIMIT_MAX', '0'],
    ['DATABASE_SSL', 'prefer'],
    ['DATABASE_POOL_MAX', '0'],
  ])('rejects invalid %s=%s', (key, value) => {
    expect(hasIssue(configError({ [key]: value }), key)).toBe(true);
  });

  it('never echoes variable values in error messages', () => {
    const error = configError({ PORT: 'super-secret-value' });
    expect(error.message).not.toContain('super-secret-value');
  });

  it('parses booleans strictly (the string "false" is false)', () => {
    expect(load({ API_DOCS_ENABLED: 'false' }).docs.enabled).toBe(false);
    expect(load({ API_DOCS_ENABLED: '1' }).docs.enabled).toBe(true);
  });

  describe('CORS_ALLOWED_ORIGINS', () => {
    it('normalizes and de-duplicates origins', () => {
      const config = load({
        CORS_ALLOWED_ORIGINS: 'https://Example.com, http://localhost:5173/,https://example.com',
      });
      expect(config.cors.allowedOrigins).toEqual(['https://example.com', 'http://localhost:5173']);
    });

    it.each(['*', 'not a url', 'ftp://example.com', 'https://example.com/path'])(
      'rejects %s',
      (value) => {
        expect(hasIssue(configError({ CORS_ALLOWED_ORIGINS: value }), 'CORS_ALLOWED_ORIGINS')).toBe(
          true,
        );
      },
    );
  });

  describe('TRUST_PROXY', () => {
    it('accepts false, hop counts, and IP/CIDR lists', () => {
      expect(load({ TRUST_PROXY: 'false' }).server.trustProxy).toBe(false);
      expect(load({ TRUST_PROXY: '2' }).server.trustProxy).toBe(2);
      expect(load({ TRUST_PROXY: '10.0.0.0/8, 127.0.0.1' }).server.trustProxy).toEqual([
        '10.0.0.0/8',
        '127.0.0.1',
      ]);
    });

    it('rejects "true" because it allows IP spoofing', () => {
      expect(hasIssue(configError({ TRUST_PROXY: 'true' }), 'TRUST_PROXY')).toBe(true);
    });

    it('rejects malformed addresses', () => {
      expect(hasIssue(configError({ TRUST_PROXY: 'proxy.internal' }), 'TRUST_PROXY')).toBe(true);
    });
  });

  describe('database', () => {
    it('requires DATABASE_URL outside of tests', () => {
      expect(hasIssue(configError({}, false), 'DATABASE_URL')).toBe(true);
      expect(hasIssue(configError({ NODE_ENV: 'production' }, false), 'DATABASE_URL')).toBe(true);
    });

    it('allows a missing DATABASE_URL when NODE_ENV=test', () => {
      expect(loadConfig({ NODE_ENV: 'test' }).database.url).toBeUndefined();
    });

    it.each(['mysql://user:pw@host/db', 'not-a-url', 'postgres://'])(
      'rejects non-PostgreSQL URL %#',
      (value) => {
        const error = configError({ DATABASE_URL: value }, false);
        expect(hasIssue(error, 'DATABASE_URL')).toBe(true);
        expect(error.message).not.toContain('pw@host');
      },
    );

    it('never echoes the connection URL (it contains credentials)', () => {
      const error = configError({ DATABASE_URL: 'postgres://user:hunter2@' }, false);
      expect(error.message).not.toContain('hunter2');
    });

    it('applies database defaults', () => {
      expect(load().database).toEqual({
        url: DB_URL,
        migrationUrl: DB_URL,
        ssl: 'disable',
        sslCa: undefined,
        poolMax: 10,
        connectionTimeoutMs: 5000,
        statementTimeoutMs: 15_000,
      });
    });

    it('defaults to verify-full SSL in production', () => {
      const config = load({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://example.com',
        EMAIL_PROVIDER: 'log',
      });
      expect(config.database.ssl).toBe('verify-full');
    });

    it('uses MIGRATION_DATABASE_URL for migrations when set', () => {
      const migrationUrl = 'postgres://user:pw@direct.example.com:5432/app';
      expect(load({ MIGRATION_DATABASE_URL: migrationUrl }).database.migrationUrl).toBe(
        migrationUrl,
      );
    });

    it('accepts a PEM CA with escaped newlines', () => {
      const config = load({
        DATABASE_SSL_CA: '-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----',
      });
      expect(config.database.sslCa).toBe(
        '-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----',
      );
    });

    it('rejects a CA that is not PEM', () => {
      expect(hasIssue(configError({ DATABASE_SSL_CA: 'not-a-cert' }), 'DATABASE_SSL_CA')).toBe(
        true,
      );
    });
  });

  describe('production', () => {
    const production = {
      NODE_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'https://example.com',
      EMAIL_PROVIDER: 'log',
    };

    it('loads a valid production environment with docs disabled by default', () => {
      const config = load(production);
      expect(config.isProduction).toBe(true);
      expect(config.docs.enabled).toBe(false);
    });

    it('requires at least one CORS origin', () => {
      expect(hasIssue(configError({ NODE_ENV: 'production' }), 'CORS_ALLOWED_ORIGINS')).toBe(true);
    });

    it('requires an explicit email choice', () => {
      const { EMAIL_PROVIDER: _omitted, ...withoutEmail } = production;
      expect(hasIssue(configError(withoutEmail), 'EMAIL_PROVIDER')).toBe(true);
      expect(
        load({
          ...withoutEmail,
          RESEND_API_KEY: 're_test',
          EMAIL_FROM: 'Studio <hi@mail.example.com>',
        }).email.provider.kind,
      ).toBe('resend');
    });

    it('forbids pretty logging', () => {
      expect(hasIssue(configError({ ...production, LOG_PRETTY: 'true' }), 'LOG_PRETTY')).toBe(true);
    });
  });
});

describe('loadDatabaseConfig', () => {
  it('needs only database variables (for migration/seed jobs)', () => {
    const { env, database } = loadDatabaseConfig({ NODE_ENV: 'production', DATABASE_URL: DB_URL });
    expect(env).toBe('production');
    expect(database.url).toBe(DB_URL);
  });

  it('still requires DATABASE_URL', () => {
    expect(() => loadDatabaseConfig({ NODE_ENV: 'development' })).toThrow(ConfigError);
  });
});
