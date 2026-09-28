import { defineConfig } from 'drizzle-kit';

// Local convenience only: load .env if present (production never uses drizzle-kit).
try {
  process.loadEnvFile('.env');
} catch {
  // No .env file; rely on the environment.
}

/**
 * drizzle-kit is a development tool: `generate` diffs the schema against the
 * committed snapshots (no database needed), `check` validates the migration
 * history, and `studio` inspects a database. Migrations are APPLIED by
 * `src/db/migrate.ts`, never by `drizzle-kit push`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
  },
  migrations: {
    schema: 'drizzle',
    table: '__drizzle_migrations',
  },
});
