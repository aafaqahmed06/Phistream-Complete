import pg from 'pg';

import { createDatabase, type Database } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/migrator.js';
import { testConfig } from './test-app.js';

/** Disposable database for tests/db. Tests are skipped when unset. */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

export const TEST_CONNECTION = {
  ssl: 'disable' as const,
  sslCa: undefined,
  connectionTimeoutMs: 5000,
};

function requireTestUrl(): string {
  if (!TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is not set');
  const name = new URL(TEST_DATABASE_URL).pathname.slice(1);
  if (!name.includes('test')) {
    throw new Error(`Refusing to reset "${name}": TEST_DATABASE_URL must name a test database`);
  }
  return TEST_DATABASE_URL;
}

/** Superuser-ish client for fixtures and assertions (raw SQL). */
export async function connectAdmin(): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: requireTestUrl() });
  await client.connect();
  return client;
}

/**
 * Drops everything and recreates an empty `public` schema. Also simulates
 * Supabase's "anon" Data API role, which receives default privileges on new
 * tables, so migrations' privilege handling can be verified.
 */
export async function resetTestDatabase(admin: pg.Client): Promise<void> {
  requireTestUrl();
  await admin.query('drop schema if exists drizzle cascade');
  await admin.query('drop schema public cascade');
  await admin.query('create schema public');
  await admin.query(`do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  end $$`);
  await admin.query('grant usage on schema public to anon');
  await admin.query('alter default privileges in schema public grant all on tables to anon');
  await admin.query('alter default privileges in schema public grant execute on functions to anon');
}

/** Empty database migrated to the latest schema. */
export async function resetAndMigrate(admin: pg.Client): Promise<void> {
  await resetTestDatabase(admin);
  await runMigrations(requireTestUrl(), TEST_CONNECTION);
}

/** Application database handle (pool + Drizzle) for the test database. */
export function createTestDatabase(poolMax = 2): Database {
  return createDatabase(
    { ...testConfig().database, ...TEST_CONNECTION, url: requireTestUrl(), poolMax },
    { error: () => undefined },
  );
}
