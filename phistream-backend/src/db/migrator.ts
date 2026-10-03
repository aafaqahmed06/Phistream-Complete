import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import type { DatabaseConfig } from '../config/env.js';
import { buildPoolConfig } from './client.js';

/**
 * Committed SQL migrations. Resolved relative to this module so it works both
 * from source (tsx) and from the build output (`build` copies the folder into
 * dist/db/migrations).
 */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

export const MIGRATIONS_SCHEMA = 'drizzle';
export const MIGRATIONS_TABLE = '__drizzle_migrations';

/** Arbitrary constant key for the session-level advisory lock. */
const MIGRATION_LOCK_KEY = 7_261_904_441;

export interface MigrationResult {
  /** Migrations applied by this run (0 when already up to date). */
  readonly applied: number;
  /** Total migrations recorded in the database after this run. */
  readonly total: number;
}

async function countApplied(client: pg.Client): Promise<number> {
  const { rows } = await client.query<{ count: string }>(
    `select count(*)::text as count from information_schema.tables
      where table_schema = $1 and table_name = $2`,
    [MIGRATIONS_SCHEMA, MIGRATIONS_TABLE],
  );
  if (rows[0]?.count !== '1') return 0;
  const result = await client.query<{ count: string }>(
    `select count(*)::text as count from "${MIGRATIONS_SCHEMA}"."${MIGRATIONS_TABLE}"`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

/**
 * Applies pending migrations (each file runs in a transaction; the migration
 * table records hashes so re-runs are no-ops).
 *
 * A session-level advisory lock serializes concurrent runs (e.g. several
 * instances starting at once), so this must use a direct or session-mode
 * connection — not a transaction-mode pooler (Supabase port 6543).
 */
export async function runMigrations(
  url: string,
  config: Pick<DatabaseConfig, 'ssl' | 'sslCa' | 'connectionTimeoutMs'>,
  migrationsFolder: string = MIGRATIONS_FOLDER,
): Promise<MigrationResult> {
  const client = new pg.Client(
    buildPoolConfig(url, { ...config, poolMax: 1, statementTimeoutMs: 0 }, 'phistream-migrations'),
  );
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      const before = await countApplied(client);
      await migrate(drizzle({ client }), {
        migrationsFolder,
        migrationsSchema: MIGRATIONS_SCHEMA,
        migrationsTable: MIGRATIONS_TABLE,
      });
      const after = await countApplied(client);
      return { applied: after - before, total: after };
    } finally {
      await client.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    await client.end();
  }
}
