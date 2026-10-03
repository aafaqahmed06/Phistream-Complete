/**
 * Pino `err` serializer that keeps diagnostics but drops submitted values.
 *
 * The default serializer copies every enumerable property and appends each
 * cause's message and stack. That leaks personal data from database errors:
 * - drizzle's `DrizzleQueryError` puts the bound parameters in its message
 *   ("Failed query: ...\nparams: jane@example.com,...") and in `params`;
 * - node-postgres errors carry the offending row in `detail`
 *   ("Failing row contains (...)" / "Key (email)=(...) already exists").
 *
 * Here the parameter list is cut from messages and stacks, known value-bearing
 * fields are dropped, and only primitive properties are copied (so objects
 * such as request bodies can never be attached by accident). SQL text, SQLSTATE
 * codes, constraint/table/column names and stack frames are kept.
 */

const MAX_CAUSE_DEPTH = 5;

/** Properties that can contain submitted values. */
const VALUE_BEARING_FIELDS = new Set([
  'params',
  'parameters',
  'detail',
  'where',
  'internalQuery',
  'body',
  'data',
  'input',
  'value',
  'values',
]);

/** Drizzle appends "\nparams: <values>" to the query in the message. */
function withoutParams(text: string): string {
  const index = text.indexOf('\nparams:');
  return index === -1 ? text : text.slice(0, index);
}

function safeStack(error: Error, safeMessage: string): string {
  if (typeof error.stack !== 'string') return '';
  // V8 stacks start with "<name>: <message>"; the frames follow on later lines.
  return error.message === safeMessage
    ? error.stack
    : error.stack.replace(error.message, safeMessage);
}

export interface SerializedError {
  type: string;
  message: string;
  stack: string;
  cause?: SerializedError;
  [key: string]: unknown;
}

function serialize(error: Error, depth: number): SerializedError {
  const message = withoutParams(error.message);
  const serialized: SerializedError = {
    type: typeof error.constructor === 'function' ? error.constructor.name : error.name,
    message,
    stack: safeStack(error, message),
  };

  for (const key of Object.keys(error)) {
    if (key === 'cause' || key === 'message' || key === 'stack') continue;
    if (VALUE_BEARING_FIELDS.has(key)) continue;
    const value: unknown = (error as unknown as Record<string, unknown>)[key];
    if (typeof value === 'string') serialized[key] = withoutParams(value);
    else if (typeof value === 'number' || typeof value === 'boolean') serialized[key] = value;
  }

  if (error.cause instanceof Error && depth < MAX_CAUSE_DEPTH) {
    serialized.cause = serialize(error.cause, depth + 1);
  }
  return serialized;
}

/**
 * Typed as taking an Error (Fastify's serializer contract), but `err` is
 * caller-supplied (e.g. an unhandled rejection reason), so non-Error values
 * are stringified rather than copied.
 */
export function serializeError(value: Error): SerializedError {
  if (value instanceof Error) return serialize(value, 0);
  const unknownValue: unknown = value;
  return { type: typeof unknownValue, message: String(unknownValue), stack: '' };
}
