import { DrizzleQueryError } from 'drizzle-orm/errors';
import { describe, expect, it } from 'vitest';

import { serializeError } from '../../src/shared/logging/error-serializer.js';

const EMAIL = 'jane.private@example.com';
const MESSAGE = 'my confidential message';

/** Shaped like node-postgres' DatabaseError for a failed insert. */
function pgError(): Error {
  return Object.assign(new Error('new row for relation "leads" violates check constraint'), {
    code: '23514',
    severity: 'ERROR',
    table: 'leads',
    constraint: 'leads_email_format',
    detail: `Failing row contains (${EMAIL}, ${MESSAGE}).`,
    where: `SQL statement with ${EMAIL}`,
  });
}

describe('error serializer', () => {
  it('removes query parameters and row details from database errors', () => {
    const error = new DrizzleQueryError(
      'insert into "leads" ("email", "full_name") values ($1, $2)',
      [EMAIL, MESSAGE],
      pgError(),
    );
    const serialized = serializeError(error);
    const text = JSON.stringify(serialized);

    expect(text).not.toContain(EMAIL);
    expect(text).not.toContain(MESSAGE);
    // Diagnostics survive.
    expect(serialized.type).toBe('DrizzleQueryError');
    expect(serialized.message).toBe(
      'Failed query: insert into "leads" ("email", "full_name") values ($1, $2)',
    );
    expect(serialized.stack).toContain('Failed query: insert into "leads"');
    expect(serialized.cause).toMatchObject({
      code: '23514',
      table: 'leads',
      constraint: 'leads_email_format',
    });
    expect(serialized.cause).not.toHaveProperty('detail');
  });

  it('copies only primitive properties', () => {
    const error = Object.assign(new Error('boom'), {
      statusCode: 500,
      retryable: true,
      request: { body: { email: EMAIL } },
    });
    const serialized = serializeError(error);

    expect(serialized).toMatchObject({
      type: 'Error',
      message: 'boom',
      statusCode: 500,
      retryable: true,
    });
    expect(JSON.stringify(serialized)).not.toContain(EMAIL);
  });

  it('keeps ordinary errors intact', () => {
    const error = new TypeError('bad thing');
    const serialized = serializeError(error);

    expect(serialized.type).toBe('TypeError');
    expect(serialized.message).toBe('bad thing');
    expect(serialized.stack).toBe(error.stack);
  });

  it('stringifies non-Error values', () => {
    expect(serializeError('plain reason' as unknown as Error)).toEqual({
      type: 'string',
      message: 'plain reason',
      stack: '',
    });
  });
});
