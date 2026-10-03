/**
 * Seeds DEMO data (see src/db/seed/demo-data.ts).
 *
 *   npm run db:seed
 *
 * Refuses to run when NODE_ENV=production. Safe to re-run.
 */
import { ConfigError, loadDatabaseConfig } from '../../config/env.js';
import { createDatabase } from '../client.js';
import { seedDemoData } from '../seed/seed.js';
import { createScriptLogger, describeDatabaseUrl } from './script-logger.js';

const logger = createScriptLogger('seed');

async function main(): Promise<void> {
  const { env, database } = loadDatabaseConfig();
  if (env === 'production') {
    throw new Error('Refusing to seed demo data with NODE_ENV=production.');
  }
  const url = database.url;
  if (url === undefined) throw new ConfigError(['DATABASE_URL: is required']);

  logger.info({ env, target: describeDatabaseUrl(url) }, 'seeding demo data');
  const handle = createDatabase({ ...database, url, poolMax: 1 }, logger);
  try {
    const result = await seedDemoData(handle.db);
    logger.info(result, 'demo data seeded');
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    logger.fatal({ err: error }, 'seed failed');
  }
  process.exitCode = 1;
});
