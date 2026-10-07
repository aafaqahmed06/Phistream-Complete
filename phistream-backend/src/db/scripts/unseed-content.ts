/**
 * Removes the DEMO content rows the public site shows (testimonials, FAQs,
 * contact email/phone, social links). See unseedDemoContent in seed/seed.ts.
 *
 *   npm run db:unseed-content
 *   npm run db:unseed-content -- --admin
 *
 * With --admin it also removes the demo rows in the /admin dashboard (demo
 * applications, leads and staff; see unseedDemoAdminData). Do that only AFTER
 * the real form (forms:publish) and real tiers (content:tiers) are live; it
 * refuses to run otherwise.
 *
 * Allowed in production: it only deletes rows by their fixed demo ids.
 */
import { ConfigError, loadDatabaseConfig } from '../../config/env.js';
import { createDatabase } from '../client.js';
import { UnseedAdminError, unseedDemoAdminData, unseedDemoContent } from '../seed/seed.js';
import { createScriptLogger, describeDatabaseUrl } from './script-logger.js';

const logger = createScriptLogger('unseed-content');

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const unknown = args.filter((arg) => arg !== '--admin');
  if (unknown.length > 0) {
    throw new UnseedAdminError(
      `Unknown argument(s): ${unknown.join(' ')}. Only --admin is accepted.`,
    );
  }
  const includeAdmin = args.includes('--admin');

  const { env, database } = loadDatabaseConfig();
  const url = database.url;
  if (url === undefined) throw new ConfigError(['DATABASE_URL: is required']);

  logger.info({ env, target: describeDatabaseUrl(url) }, 'removing demo content');
  const handle = createDatabase({ ...database, url, poolMax: 1 }, logger);
  try {
    const result = await unseedDemoContent(handle.db);
    logger.info(result, 'demo content removed');
    if (includeAdmin) {
      const admin = await unseedDemoAdminData(handle.db);
      logger.info(admin, 'demo admin data removed');
    }
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError || error instanceof UnseedAdminError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    logger.fatal({ err: error }, 'unseed failed');
  }
  process.exitCode = 1;
});
