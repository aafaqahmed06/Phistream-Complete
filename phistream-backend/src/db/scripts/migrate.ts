/**
 * Applies committed SQL migrations.
 *
 *   npm run db:migrate          (development, from source, loads .env)
 *   node dist/db/scripts/migrate.js   (production image / release job)
 *
 * Uses MIGRATION_DATABASE_URL if set, otherwise DATABASE_URL.
 */
import { ConfigError, loadDatabaseConfig } from '../../config/env.js';
import { runMigrations } from '../migrator.js';
import { createScriptLogger, describeDatabaseUrl } from './script-logger.js';

const logger = createScriptLogger('migrate');

async function main(): Promise<void> {
  const { env, database } = loadDatabaseConfig();
  const url = database.migrationUrl;
  if (url === undefined) {
    throw new ConfigError(['MIGRATION_DATABASE_URL or DATABASE_URL: is required']);
  }

  logger.info({ env, target: describeDatabaseUrl(url) }, 'applying migrations');
  const result = await runMigrations(url, database);
  logger.info(result, result.applied > 0 ? 'migrations applied' : 'database already up to date');
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    logger.fatal({ err: error }, 'migration failed');
  }
  process.exitCode = 1;
});
