/**
 * Publishes the real service tiers and hides the demo ones.
 *
 *   npm run content:tiers
 *   node dist/db/scripts/publish-service-tiers.js     # production image (content:tiers:prod)
 *
 * The tiers live in src/db/content/service-tiers.ts. There is no admin editor
 * for tiers yet, so to change one: edit that file, then run this again. Safe
 * to re-run.
 */
import { ConfigError, loadDatabaseConfig } from '../../config/env.js';
import { publishServiceTiers } from '../content/service-tiers.js';
import { createDatabase } from '../client.js';
import { createScriptLogger, describeDatabaseUrl } from './script-logger.js';

const logger = createScriptLogger('content-tiers');

async function main(): Promise<void> {
  const { env, database } = loadDatabaseConfig();
  const url = database.url;
  if (url === undefined) throw new ConfigError(['DATABASE_URL: is required']);

  logger.info({ env, target: describeDatabaseUrl(url) }, 'publishing service tiers');
  const handle = createDatabase({ ...database, url, poolMax: 1 }, logger);
  try {
    const result = await publishServiceTiers(handle.db);
    logger.info(result, 'service tiers published');
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    logger.fatal({ err: error }, 'publishing service tiers failed');
  }
  process.exitCode = 1;
});
