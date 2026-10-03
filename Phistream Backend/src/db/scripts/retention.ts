/**
 * Applies the data-retention policy (deletes aged operational data).
 *
 *   npm run retention -- --dry-run          count only
 *   npm run retention                       delete (audited as retention.applied)
 *   npm run retention -- --analytics-days=395 --notification-days=365 \
 *                        --webhook-days=365 --expired-token-days=30
 *
 * Run it on a schedule (e.g. daily) from the production image:
 *   node dist/db/scripts/retention.js
 * See PRODUCTION_READINESS.md › Data retention.
 */
import { ConfigError, loadDatabaseConfig } from '../../config/env.js';
import {
  applyRetention,
  DEFAULT_RETENTION_POLICY,
  type RetentionPolicy,
} from '../../modules/admin/data-retention.js';
import { createDatabase } from '../client.js';
import { createScriptLogger, describeDatabaseUrl } from './script-logger.js';

const logger = createScriptLogger('retention');

const FLAGS: Record<string, keyof RetentionPolicy> = {
  '--analytics-days': 'analyticsDays',
  '--notification-days': 'notificationDays',
  '--webhook-days': 'webhookDays',
  '--expired-token-days': 'expiredTokenDays',
};

class UsageError extends Error {}

function parseArgs(args: readonly string[]): { policy: RetentionPolicy; dryRun: boolean } {
  const policy: Record<keyof RetentionPolicy, number> = { ...DEFAULT_RETENTION_POLICY };
  let dryRun = false;
  for (const arg of args) {
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    const [flag = '', value = ''] = arg.split('=');
    const key = FLAGS[flag];
    const days = Number(value);
    if (!key || !Number.isInteger(days) || days < 1 || days > 3650) {
      throw new UsageError(`Unknown or invalid argument "${arg}" (days must be 1-3650).`);
    }
    policy[key] = days;
  }
  return { policy, dryRun };
}

async function main(): Promise<void> {
  const { policy, dryRun } = parseArgs(process.argv.slice(2));
  const { env, database } = loadDatabaseConfig();
  const url = database.url;
  if (url === undefined) throw new ConfigError(['DATABASE_URL: is required']);

  logger.info(
    { env, target: describeDatabaseUrl(url), policy, dryRun },
    'applying retention policy',
  );
  const handle = createDatabase({ ...database, url, poolMax: 1 }, logger);
  try {
    const result = await applyRetention(handle.db, policy, { dryRun });
    logger.info({ dryRun, ...result }, dryRun ? 'retention dry run' : 'retention applied');
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError || error instanceof UsageError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    logger.fatal({ err: error }, 'retention failed');
  }
  process.exitCode = 1;
});
