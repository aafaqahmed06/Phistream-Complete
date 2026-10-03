import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'vitest';

import { buildPoolConfig, guardClientErrors } from '../../src/db/client.js';

const base = {
  ssl: 'disable' as const,
  sslCa: undefined,
  poolMax: 5,
  connectionTimeoutMs: 1000,
  statementTimeoutMs: 2000,
};

describe('buildPoolConfig', () => {
  it('maps pool settings', () => {
    const config = buildPoolConfig('postgres://u:p@db.example.com:5432/app', base);
    expect(config).toMatchObject({
      max: 5,
      connectionTimeoutMillis: 1000,
      statement_timeout: 2000,
      application_name: 'phistream-backend',
      ssl: false,
    });
  });

  it('strips SSL query parameters so DATABASE_SSL is authoritative', () => {
    const config = buildPoolConfig(
      'postgres://u:p@db.example.com:6543/app?sslmode=require&sslrootcert=/x.pem&pgbouncer=true',
      base,
    );
    const url = new URL(config.connectionString ?? '');
    expect(url.searchParams.has('sslmode')).toBe(false);
    expect(url.searchParams.has('sslrootcert')).toBe(false);
    expect(url.searchParams.get('pgbouncer')).toBe('true');
  });

  it('encrypts without verification for "require"', () => {
    expect(buildPoolConfig('postgres://h/db', { ...base, ssl: 'require' }).ssl).toEqual({
      rejectUnauthorized: false,
    });
  });

  it('verifies the server certificate for "verify-full", using the CA when given', () => {
    expect(buildPoolConfig('postgres://h/db', { ...base, ssl: 'verify-full' }).ssl).toEqual({
      rejectUnauthorized: true,
    });
    expect(
      buildPoolConfig('postgres://h/db', { ...base, ssl: 'verify-full', sslCa: 'PEM' }).ssl,
    ).toEqual({ rejectUnauthorized: true, ca: 'PEM' });
  });

  it('omits statement_timeout when set to 0', () => {
    const config = buildPoolConfig('postgres://h/db', { ...base, statementTimeoutMs: 0 });
    expect(config).not.toHaveProperty('statement_timeout');
  });
});

describe('guardClientErrors', () => {
  it('turns a dropped connection on a checked-out client into a log line, not a crash', () => {
    const pool = new EventEmitter();
    const logged: string[] = [];
    guardClientErrors(pool as never, { error: (_object, message) => logged.push(message) });

    // A new client, then checked out: the pool's own idle listener is gone.
    const client = new EventEmitter();
    pool.emit('connect', client);

    // An 'error' event with no listener would throw (an uncaught exception).
    expect(() =>
      client.emit('error', new Error('Connection terminated unexpectedly')),
    ).not.toThrow();
    expect(logged).toEqual(['database connection lost']);
  });
});
