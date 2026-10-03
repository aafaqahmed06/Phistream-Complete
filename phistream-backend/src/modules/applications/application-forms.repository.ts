import { eq } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { applicationForms } from '../../db/schema/index.js';
import {
  FORM_VERSION_PATTERN,
  formDefinitionSchema,
  type FormDefinition,
} from './application-form.js';

export class FormPublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormPublishError';
  }
}

/**
 * Publishes a new eligibility form version: validates the definition, retires
 * the currently ACTIVE version, and inserts the new one as ACTIVE, in one
 * transaction. Versions are immutable once published, so an existing version
 * name cannot be reused. Used by `npm run forms:publish` (and later by the
 * content admin API).
 */
export async function publishApplicationForm(
  db: Db,
  input: { version: string; definition: unknown; now?: Date },
): Promise<{ version: string; retired: string | undefined; definition: FormDefinition }> {
  if (!FORM_VERSION_PATTERN.test(input.version)) {
    throw new FormPublishError(
      `Invalid form version "${input.version}": use letters, digits, ".", "_" or "-" (max 50).`,
    );
  }
  const parsed = formDefinitionSchema.safeParse(input.definition);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new FormPublishError(`Invalid form definition:\n  - ${problems.join('\n  - ')}`);
  }
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: applicationForms.id })
      .from(applicationForms)
      .where(eq(applicationForms.version, input.version))
      .limit(1);
    if (existing.length > 0) {
      throw new FormPublishError(
        `Form version "${input.version}" already exists. Published versions are immutable; choose a new version.`,
      );
    }

    const retired = await tx
      .update(applicationForms)
      .set({ status: 'RETIRED', retiredAt: now })
      .where(eq(applicationForms.status, 'ACTIVE'))
      .returning({ version: applicationForms.version });

    await tx.insert(applicationForms).values({
      version: input.version,
      status: 'ACTIVE',
      // Store the normalized definition (defaults applied) that is served.
      definition: parsed.data,
      publishedAt: now,
    });

    return { version: input.version, retired: retired[0]?.version, definition: parsed.data };
  });
}
