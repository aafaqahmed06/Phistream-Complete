import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import type { DatabaseConfig, DatabaseSslMode } from '../config/env.js';
import * as schema from './schema/index.js';

export type Db = NodePgDatabase<typeof schema>;

/** The handle passed to `db.transaction(async (tx) => ...)`. */
export type DbTransaction = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Either the pool-backed handle or an open transaction. */
export type DbExecutor = Db | DbTransaction;

export interface Database {
  readonly db: Db;
  /** Cheap connectivity check used by the readiness endpoint. */
  ping(): Promise<void>;
  /** Drains the pool. Safe to call more than once. */
  close(): Promise<void>;
}

export interface DatabaseLogger {
  error(object: object, message: string): void;
}

/**
 * SSL-related query parameters are removed from the URL because node-postgres
 * lets them override the explicit `ssl` option; DATABASE_SSL is the single
 * source of truth instead.
 */
const SSL_URL_PARAMS = ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'];

function toSslOption(mode: DatabaseSslMode, ca: string | undefined): pg.PoolConfig['ssl'] {
  switch (mode) {
    case 'disable':
      return false;
    case 'require':
      // Encrypted, but the server certificate is not verified.
      return { rejectUnauthorized: false };
    case 'verify-full':
      return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
  }
}

export function buildPoolConfig(
  url: string,
  config: Pick<
    DatabaseConfig,
    'ssl' | 'sslCa' | 'poolMax' | 'connectionTimeoutMs' | 'statementTimeoutMs'
  >,
  applicationName = 'phistream-backend',
): pg.PoolConfig {
  const parsed = new URL(url);
  for (const param of SSL_URL_PARAMS) parsed.searchParams.delete(param);

  return {
    connectionString: parsed.toString(),
    ssl: toSslOption(config.ssl, config.sslCa),
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: 30_000,
    // 0 disables the timeout (node-postgres treats a falsy value as "none").
    ...(config.statementTimeoutMs > 0 ? { statement_timeout: config.statementTimeoutMs } : {}),
    application_name: applicationName,
  };
}

export function createDatabase(
  config: DatabaseConfig & { url: string },
  logger: DatabaseLogger,
): Database {
  const pool = new pg.Pool(buildPoolConfig(config.url, config));

  // Without a listener, an error on an idle client would crash the process.
  pool.on('error', (error) => {
    logger.error({ err: error }, 'idle database client error');
  });

  const db = drizzle({ client: pool, schema });
  let closed = false;

  return {
    db,
    async ping() {
      await pool.query('select 1');
    },
    async close() {
      if (closed) return;
      closed = true;
      await pool.end();
    },
  };
}
