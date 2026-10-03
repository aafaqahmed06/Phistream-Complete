/**
 * Staff provisioning (maps Supabase Auth users to staff roles).
 *
 *   npm run staff -- add <auth-user-id> <email> <display name> <ADMIN|REVIEWER>
 *   npm run staff -- deactivate <email>
 *   npm run staff -- activate <email>
 *   npm run staff -- role <email> <ADMIN|REVIEWER>
 *   npm run staff -- list
 *
 * <auth-user-id> is the user's id in Supabase (Authentication → Users), i.e.
 * the `sub` of their access tokens. Every change is written to audit_logs.
 * Deactivation takes effect on the user's next request.
 */
import { z } from 'zod';

import { ConfigError, loadDatabaseConfig } from '../../config/env.js';
import {
  createStaffAdministration,
  StaffProvisioningError,
} from '../../modules/admin/staff.repository.js';
import { STAFF_ROLES } from '../schema/enums.js';
import { createDatabase } from '../client.js';
import { createScriptLogger, describeDatabaseUrl } from './script-logger.js';

const logger = createScriptLogger('staff');

const role = z.enum(STAFF_ROLES, { error: `role must be one of ${STAFF_ROLES.join(', ')}` });
const email = z.email({ error: 'email is invalid' }).max(320);

const USAGE = `Usage:
  npm run staff -- add <auth-user-id> <email> <display name> <ADMIN|REVIEWER>
  npm run staff -- deactivate <email>
  npm run staff -- activate <email>
  npm run staff -- role <email> <ADMIN|REVIEWER>
  npm run staff -- list`;

function parse<T>(schema: z.ZodType<T>, value: string | undefined): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new StaffProvisioningError(result.error.issues[0]?.message ?? 'invalid argument');
  }
  return result.data;
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (!command) throw new StaffProvisioningError(USAGE);

  const { env, database } = loadDatabaseConfig();
  const url = database.url;
  if (url === undefined) throw new ConfigError(['DATABASE_URL: is required']);

  const handle = createDatabase({ ...database, url, poolMax: 1 }, logger);
  const staff = createStaffAdministration(handle.db);
  logger.info({ env, target: describeDatabaseUrl(url), command }, 'staff command');
  try {
    switch (command) {
      case 'add': {
        const [authProviderId, rawEmail, displayName, rawRole] = args;
        const created = await staff.add({
          authProviderId: parse(z.string().trim().min(1).max(255), authProviderId),
          email: parse(email, rawEmail),
          displayName: parse(z.string().trim().min(1).max(200), displayName),
          role: parse(role, rawRole),
        });
        logger.info({ staffId: created.id, role: created.role }, 'staff user added');
        break;
      }
      case 'deactivate':
      case 'activate':
        await staff.setActive(parse(email, args[0]), command === 'activate');
        logger.info({ command }, 'staff user updated');
        break;
      case 'role':
        await staff.setRole(parse(email, args[0]), parse(role, args[1]));
        logger.info({ command }, 'staff user updated');
        break;
      case 'list':
        for (const user of await staff.list()) {
          process.stdout.write(
            `${user.isActive ? 'active  ' : 'inactive'}  ${user.role.padEnd(8)}  ${user.email}  (${user.displayName}; auth ${user.authProviderId})\n`,
          );
        }
        break;
      default:
        throw new StaffProvisioningError(USAGE);
    }
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError || error instanceof StaffProvisioningError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    logger.fatal({ err: error }, 'staff command failed');
  }
  process.exitCode = 1;
});
