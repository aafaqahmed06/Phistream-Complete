/**
 * Removes the DEMO content rows the public site shows (testimonials, FAQs,
 * contact email/phone, social links). See unseedDemoContent in seed/seed.ts.
 *
 *   npm run db:unseed-content
 *
 * Allowed in production: it only deletes rows by their fixed demo ids.
 */
import { ConfigError, loadDatabaseConfig } from '../../config/env.js';
import { createDatabase } from '../client.js';
import { unseedDemoContent } from '../seed/seed.js';
import { createScriptLogger, describeDatabaseUrl } from './script-logger.js';

const logger = createScriptLogger('unseed-content');

async function main(): Promise<void> {
  const { env, database } = loadDatabaseConfig();
  const url = database.url;
  if (url === undefined) throw new ConfigError(['DATABASE_URL: is required']);

  logger.info({ env, target: describeDatabaseUrl(url) }, 'removing demo content');
  const handle = createDatabase({ ...database, url, poolMax: 1 }, logger);
  try {
    const result = await unseedDemoContent(handle.db);
    logger.info(result, 'demo content removed');
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    logger.fatal({ err: error }, 'unseed failed');
  }
  process.exitCode = 1;
});
