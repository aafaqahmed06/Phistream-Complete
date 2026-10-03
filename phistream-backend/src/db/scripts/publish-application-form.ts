/**
 * Publishes a new eligibility form version from a JSON file.
 *
 *   npm run forms:publish -- <version> <definition.json>
 *
 * The definition is validated with the same schema the API uses
 * (src/modules/applications/application-form.ts). The currently ACTIVE
 * version is retired and the new one becomes ACTIVE, in one transaction.
 * Published versions are immutable: to change a question, publish a new
 * version. See docs/applications.md for the definition format.
 */
import { readFile } from 'node:fs/promises';

import { ConfigError, loadDatabaseConfig } from '../../config/env.js';
import {
  FormPublishError,
  publishApplicationForm,
} from '../../modules/applications/application-forms.repository.js';
import { createDatabase } from '../client.js';
import { createScriptLogger, describeDatabaseUrl } from './script-logger.js';

const logger = createScriptLogger('forms-publish');

async function main(): Promise<void> {
  const [version, file] = process.argv.slice(2);
  if (!version || !file) {
    throw new FormPublishError('Usage: npm run forms:publish -- <version> <definition.json>');
  }

  let definition: unknown;
  try {
    definition = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    throw new FormPublishError(
      `Could not read ${file} as JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const { env, database } = loadDatabaseConfig();
  const url = database.url;
  if (url === undefined) throw new ConfigError(['DATABASE_URL: is required']);

  logger.info({ env, target: describeDatabaseUrl(url), version }, 'publishing application form');
  const handle = createDatabase({ ...database, url, poolMax: 1 }, logger);
  try {
    const result = await publishApplicationForm(handle.db, { version, definition });
    logger.info(
      {
        version: result.version,
        retired: result.retired ?? null,
        questions: result.definition.questions.length,
      },
      'application form published',
    );
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  if (error instanceof ConfigError || error instanceof FormPublishError) {
    process.stderr.write(`${error.message}\n`);
  } else {
    logger.fatal({ err: error }, 'publishing the application form failed');
  }
  process.exitCode = 1;
});
