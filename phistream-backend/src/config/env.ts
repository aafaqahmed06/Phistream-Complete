import { isIP } from 'node:net';
import { z } from 'zod';

/**
 * Environment validation.
 *
 * All runtime configuration flows through `loadConfig` (the API server) or
 * `loadDatabaseConfig` (migration/seed scripts). The process refuses to start
 * when the environment is invalid (fail fast). Error messages name the
 * offending variables but never echo their values, since values may be secrets.
 */

const NODE_ENVS = ['development', 'test', 'production'] as const;
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const DATABASE_SSL_MODES = ['disable', 'require', 'verify-full'] as const;

const booleanString = z
  .enum(['true', 'false', '1', '0'], { error: 'must be one of: true, false, 1, 0' })
  .transform((value) => value === 'true' || value === '1');

const intString = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

const originList = z.string().transform((raw, ctx) => {
  const origins: string[] = [];
  for (const entry of raw.split(',')) {
    const candidate = entry.trim();
    if (candidate === '') continue;
    if (candidate === '*') {
      ctx.addIssue({ code: 'custom', message: 'wildcard origin "*" is not allowed' });
      continue;
    }
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      ctx.addIssue({ code: 'custom', message: `"${candidate}" is not a valid origin` });
      continue;
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      ctx.addIssue({ code: 'custom', message: `"${candidate}" must use http or https` });
      continue;
    }
    if (url.origin !== candidate.replace(/\/$/, '').toLowerCase()) {
      ctx.addIssue({
        code: 'custom',
        message: `"${candidate}" must be a bare origin (scheme://host[:port]) without path`,
      });
      continue;
    }
    origins.push(url.origin);
  }
  return [...new Set(origins)];
});

/**
 * Accepted TRUST_PROXY values:
 * - "false" (default): do not trust X-Forwarded-* headers.
 * - a positive integer: trust that many proxy hops (typical for managed hosts).
 * - a comma-separated list of IPs/CIDRs: trust only those proxies.
 *
 * "true" is rejected: trusting every hop lets any client spoof its IP via
 * X-Forwarded-For, which would defeat IP-based rate limiting.
 */
const trustProxy = z.string().transform((raw, ctx): false | number | string[] => {
  const value = raw.trim();
  if (value === 'false' || value === '0') return false;
  if (value === 'true') {
    ctx.addIssue({
      code: 'custom',
      message: '"true" is not allowed; use a hop count (e.g. 1) or a list of proxy IPs/CIDRs',
    });
    return z.NEVER;
  }
  if (/^\d+$/.test(value)) return Number(value);

  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  for (const entry of entries) {
    const [address = '', prefix, ...rest] = entry.split('/');
    const validPrefix = prefix === undefined || /^\d{1,3}$/.test(prefix);
    if (isIP(address) === 0 || !validPrefix || rest.length > 0) {
      ctx.addIssue({ code: 'custom', message: `"${entry}" is not a valid IP address or CIDR` });
    }
  }
  if (entries.length === 0) {
    ctx.addIssue({ code: 'custom', message: 'must not be empty' });
  }
  return entries;
});

const httpUrl = z
  .url({ protocol: /^https?$/, error: 'must be an http(s) URL' })
  .transform((value) => value.replace(/\/$/, ''));

/** Error messages must not include the URL: it contains credentials. */
const postgresUrl = z.string().refine(
  (value) => {
    try {
      const url = new URL(value);
      return (
        (url.protocol === 'postgres:' || url.protocol === 'postgresql:') && url.hostname !== ''
      );
    } catch {
      return false;
    }
  },
  { error: 'must be a postgres:// or postgresql:// connection URL' },
);

const databaseShape = {
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  DATABASE_URL: postgresUrl.optional(),
  MIGRATION_DATABASE_URL: postgresUrl.optional(),
  DATABASE_SSL: z.enum(DATABASE_SSL_MODES).optional(),
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_MAX: intString(1, 100).default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: intString(250, 60_000).default(5000),
  DATABASE_STATEMENT_TIMEOUT_MS: intString(0, 600_000).default(15_000),
};

const serverShape = {
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: intString(1, 65_535).default(3000),
  TRUST_PROXY: trustProxy.default(false),
  BODY_LIMIT_BYTES: intString(1024, 10 * 1024 * 1024).default(100 * 1024),
  SHUTDOWN_TIMEOUT_MS: intString(1000, 120_000).default(10_000),
  /** Maximum time to receive a whole request (slow-client protection). */
  REQUEST_TIMEOUT_MS: intString(1000, 300_000).default(30_000),

  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  LOG_PRETTY: booleanString.default(false),

  CORS_ALLOWED_ORIGINS: originList.default([]),

  RATE_LIMIT_MAX: intString(1, 100_000).default(100),
  RATE_LIMIT_WINDOW_MS: intString(1000, 24 * 60 * 60 * 1000).default(60_000),

  API_DOCS_ENABLED: booleanString.optional(),

  /** Cache-Control max-age for public content responses (0 = no-cache). */
  CONTENT_CACHE_MAX_AGE_SECONDS: intString(0, 86_400).default(60),

  /** Per-IP limit for POST /contact (independent of the global limit). */
  CONTACT_RATE_LIMIT_MAX: intString(1, 1000).default(5),
  CONTACT_RATE_LIMIT_WINDOW_MS: intString(1000, 24 * 60 * 60 * 1000).default(10 * 60 * 1000),

  /** Per-IP limit for POST /applications (independent of the global limit). */
  APPLICATION_RATE_LIMIT_MAX: intString(1, 1000).default(5),
  APPLICATION_RATE_LIMIT_WINDOW_MS: intString(1000, 24 * 60 * 60 * 1000).default(60 * 60 * 1000),
  /** Lifetime of the status token returned at submission (1 hour to 90 days). */
  APPLICATION_STATUS_TOKEN_TTL_HOURS: intString(1, 90 * 24).default(7 * 24),

  /**
   * Staff authentication (Supabase Auth). The project URL, e.g.
   * https://<project-ref>.supabase.co. Access tokens are verified against its
   * JWKS (asymmetric signing keys), or against SUPABASE_JWT_SECRET for
   * projects still on the legacy shared secret. Unset = admin API disabled.
   */
  SUPABASE_URL: z
    .url({ protocol: /^https?$/, error: 'must be an http(s) URL' })
    .refine((value) => new URL(value).pathname === '/' || new URL(value).pathname === '', {
      error: 'must be the project URL without a path',
    })
    .optional(),
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),
  STAFF_AUTH_AUDIENCE: z.string().min(1).default('authenticated'),

  /**
   * Scheduling provider: "calcom" (production) or "mock" (development/tests;
   * refused in production). Unset = scheduling disabled (503/404).
   */
  SCHEDULING_PROVIDER: z.enum(['calcom', 'mock']).optional(),
  /** Lifetime of an applicant's scheduling access token (1 hour to 30 days). */
  SCHEDULING_TOKEN_TTL_HOURS: intString(1, 30 * 24).default(72),
  /**
   * Frontend page that reads the token from the URL fragment and calls
   * GET /api/v1/scheduling/session, e.g. https://phistream.example/schedule.
   * Used to build links for staff (and, later, emails).
   */
  SCHEDULING_PAGE_URL: httpUrl.optional(),

  CALCOM_BOOKING_URL: httpUrl.optional(),
  CALCOM_WEBHOOK_SECRET: z.string().min(16).optional(),
  CALCOM_API_KEY: z.string().min(1).optional(),
  CALCOM_API_BASE_URL: httpUrl.default('https://api.cal.com/v2'),
  CALCOM_API_VERSION: z.string().min(1).default('2024-08-13'),

  MOCK_SCHEDULING_WEBHOOK_SECRET: z.string().min(16).optional(),

  /**
   * Email: "resend" or "log" (captures in memory, sends nothing). Default:
   * resend when RESEND_API_KEY and EMAIL_FROM are set, otherwise log. In
   * production, log must be chosen explicitly.
   */
  EMAIL_PROVIDER: z.enum(['resend', 'log']).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_API_BASE_URL: httpUrl.default('https://api.resend.com'),
  /** Sender on a domain verified in Resend, e.g. "Phistream Studio <hello@mail.example.com>". */
  EMAIL_FROM: z
    .string()
    .trim()
    .max(320)
    .regex(/^(?:[^<>\r\n]+ <[^\s@<>]+@[^\s@<>]+>|[^\s@<>]+@[^\s@<>]+)$/, {
      error: 'must be an address or "Name <address>"',
    })
    .optional(),
  EMAIL_REPLY_TO: z.email().optional(),
  /** Staff recipients for internal notifications; default: all active ADMIN staff. */
  STAFF_NOTIFICATION_EMAILS: z
    .string()
    .transform((raw, ctx) => {
      const emails = raw
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry !== '');
      for (const email of emails) {
        if (!z.email().safeParse(email).success) {
          ctx.addIssue({ code: 'custom', message: 'must be a comma-separated list of emails' });
          return z.NEVER;
        }
      }
      return [...new Set(emails)];
    })
    .optional(),
  /** Admin dashboard base URL, for links in staff emails. */
  ADMIN_DASHBOARD_URL: httpUrl.optional(),

  NOTIFICATIONS_WORKER_ENABLED: booleanString.default(true),
  NOTIFICATIONS_POLL_INTERVAL_MS: intString(1000, 10 * 60 * 1000).default(15_000),
  NOTIFICATIONS_BATCH_SIZE: intString(1, 100).default(10),
  NOTIFICATIONS_MAX_ATTEMPTS: intString(1, 50).default(8),

  /** Per-IP limit for POST /analytics/events (VSL progress sends several per visit). */
  ANALYTICS_RATE_LIMIT_MAX: intString(1, 10_000).default(120),
  ANALYTICS_RATE_LIMIT_WINDOW_MS: intString(1000, 60 * 60 * 1000).default(60_000),
};

type DatabaseEnv = z.infer<z.ZodObject<typeof databaseShape>>;

function refineDatabaseEnv(env: DatabaseEnv, ctx: z.RefinementCtx): void {
  // Tests build the app without a database unless they opt in.
  if (env.NODE_ENV !== 'test' && env.DATABASE_URL === undefined) {
    ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'is required' });
  }
  if (env.DATABASE_SSL_CA !== undefined && !env.DATABASE_SSL_CA.includes('-----BEGIN')) {
    ctx.addIssue({
      code: 'custom',
      path: ['DATABASE_SSL_CA'],
      message: 'must be a PEM-encoded certificate',
    });
  }
}

const databaseEnvSchema = z.object(databaseShape).superRefine(refineDatabaseEnv);

const envSchema = z.object({ ...databaseShape, ...serverShape }).superRefine((env, ctx) => {
  refineDatabaseEnv(env, ctx);
  if (env.SUPABASE_JWT_SECRET !== undefined && env.SUPABASE_URL === undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['SUPABASE_URL'],
      message: 'is required when SUPABASE_JWT_SECRET is set (it defines the token issuer)',
    });
  }
  const requireFor = (provider: string, keys: (keyof typeof env)[]) => {
    if (env.SCHEDULING_PROVIDER !== provider) return;
    for (const key of keys) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: `is required when SCHEDULING_PROVIDER=${provider}`,
        });
      }
    }
  };
  requireFor('calcom', ['CALCOM_BOOKING_URL', 'CALCOM_WEBHOOK_SECRET']);
  requireFor('mock', ['MOCK_SCHEDULING_WEBHOOK_SECRET']);
  if (env.EMAIL_PROVIDER === 'resend') {
    for (const key of ['RESEND_API_KEY', 'EMAIL_FROM'] as const) {
      if (env[key] === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'is required when EMAIL_PROVIDER=resend',
        });
      }
    }
  }

  if (env.NODE_ENV !== 'production') return;
  if (
    env.EMAIL_PROVIDER === undefined &&
    (env.RESEND_API_KEY === undefined || env.EMAIL_FROM === undefined)
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['EMAIL_PROVIDER'],
      message:
        'set RESEND_API_KEY and EMAIL_FROM, or EMAIL_PROVIDER=log to run without sending email',
    });
  }
  if (env.SCHEDULING_PROVIDER === 'mock') {
    ctx.addIssue({
      code: 'custom',
      path: ['SCHEDULING_PROVIDER'],
      message: 'the mock provider is not allowed in production',
    });
  }
  for (const key of ['CALCOM_BOOKING_URL', 'SCHEDULING_PAGE_URL'] as const) {
    const value = env[key];
    if (value !== undefined && !value.startsWith('https://')) {
      ctx.addIssue({ code: 'custom', path: [key], message: 'must use https in production' });
    }
  }
  if (env.SUPABASE_URL !== undefined && !env.SUPABASE_URL.startsWith('https://')) {
    ctx.addIssue({
      code: 'custom',
      path: ['SUPABASE_URL'],
      message: 'must use https in production',
    });
  }
  if (env.CORS_ALLOWED_ORIGINS.length === 0) {
    ctx.addIssue({
      code: 'custom',
      path: ['CORS_ALLOWED_ORIGINS'],
      message: 'at least one origin is required in production',
    });
  }
  if (env.LOG_PRETTY) {
    ctx.addIssue({
      code: 'custom',
      path: ['LOG_PRETTY'],
      message: 'pretty logging is not allowed in production (pino-pretty is a dev dependency)',
    });
  }
});

export type NodeEnv = (typeof NODE_ENVS)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];
export type DatabaseSslMode = (typeof DATABASE_SSL_MODES)[number];

export interface DatabaseConfig {
  /** Runtime (pooled) connection URL. Undefined only when NODE_ENV=test. */
  readonly url: string | undefined;
  /** Connection used by migrations; falls back to `url`. */
  readonly migrationUrl: string | undefined;
  readonly ssl: DatabaseSslMode;
  readonly sslCa: string | undefined;
  readonly poolMax: number;
  readonly connectionTimeoutMs: number;
  readonly statementTimeoutMs: number;
}

export interface AppConfig {
  readonly env: NodeEnv;
  readonly isProduction: boolean;
  readonly server: {
    readonly host: string;
    readonly port: number;
    readonly trustProxy: false | number | string[];
    readonly bodyLimitBytes: number;
    readonly shutdownTimeoutMs: number;
    readonly requestTimeoutMs: number;
  };
  readonly logging: {
    readonly level: LogLevel;
    readonly pretty: boolean;
  };
  readonly cors: {
    readonly allowedOrigins: readonly string[];
  };
  readonly rateLimit: {
    readonly max: number;
    readonly windowMs: number;
  };
  readonly docs: {
    readonly enabled: boolean;
  };
  readonly content: {
    readonly cacheMaxAgeSeconds: number;
  };
  readonly contact: {
    readonly rateLimit: { readonly max: number; readonly windowMs: number };
  };
  readonly applications: {
    readonly rateLimit: { readonly max: number; readonly windowMs: number };
    readonly statusTokenTtlMs: number;
  };
  /** Staff authentication via Supabase Auth; undefined = admin API disabled. */
  readonly staffAuth: StaffAuthConfig | undefined;
  readonly scheduling: SchedulingConfig;
  readonly email: EmailConfig;
  readonly notifications: NotificationsConfig;
  readonly analytics: {
    readonly rateLimit: { readonly max: number; readonly windowMs: number };
  };
  readonly database: DatabaseConfig;
}

export type SchedulingProviderConfig =
  | {
      readonly kind: 'calcom';
      readonly bookingUrl: string;
      readonly webhookSecret: string;
      readonly apiKey: string | undefined;
      readonly apiBaseUrl: string;
      readonly apiVersion: string;
    }
  | { readonly kind: 'mock'; readonly webhookSecret: string };

export interface SchedulingConfig {
  /** Undefined = scheduling disabled. */
  readonly provider: SchedulingProviderConfig | undefined;
  readonly tokenTtlMs: number;
  readonly pageUrl: string | undefined;
}

export interface EmailConfig {
  readonly provider:
    | { readonly kind: 'resend'; readonly apiKey: string; readonly apiBaseUrl: string }
    | { readonly kind: 'log' };
  readonly from: string;
  readonly replyTo: string | undefined;
}

export interface NotificationsConfig {
  readonly workerEnabled: boolean;
  readonly pollIntervalMs: number;
  readonly batchSize: number;
  readonly maxAttempts: number;
  /** Explicit staff recipients; undefined = all active ADMIN staff. */
  readonly staffRecipients: readonly string[] | undefined;
  readonly adminDashboardUrl: string | undefined;
}

/** Sender used by the log provider when EMAIL_FROM is unset (never delivered). */
export const DEFAULT_LOG_SENDER = 'Phistream Studio <no-reply@example.invalid>';

export interface StaffAuthConfig {
  /** Expected `iss` claim: `<SUPABASE_URL>/auth/v1`. */
  readonly issuer: string;
  /** Expected `aud` claim. */
  readonly audience: string;
  /** JWKS endpoint for asymmetric signing keys. */
  readonly jwksUrl: string;
  /** Legacy HS256 shared secret; when set, it is used instead of the JWKS. */
  readonly jwtSecret: string | undefined;
}

export class ConfigError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Empty strings are treated as "unset" so defaults apply (e.g. `PORT=` in a .env file). */
function withoutEmptyValues(source: NodeJS.ProcessEnv): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') result[key] = value;
  }
  return result;
}

function parseOrThrow<T>(schema: z.ZodType<T>, source: NodeJS.ProcessEnv): T {
  const parsed = schema.safeParse(withoutEmptyValues(source));
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`),
    );
  }
  return parsed.data;
}

function toDatabaseConfig(env: DatabaseEnv): DatabaseConfig {
  return {
    url: env.DATABASE_URL,
    migrationUrl: env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL,
    // Secure by default in production; local Postgres usually has no TLS.
    ssl: env.DATABASE_SSL ?? (env.NODE_ENV === 'production' ? 'verify-full' : 'disable'),
    sslCa: env.DATABASE_SSL_CA?.replaceAll('\\n', '\n'),
    poolMax: env.DATABASE_POOL_MAX,
    connectionTimeoutMs: env.DATABASE_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS,
  };
}

function toEmailConfig(env: z.output<typeof envSchema>): EmailConfig {
  const useResend =
    env.EMAIL_PROVIDER === 'resend' ||
    (env.EMAIL_PROVIDER === undefined &&
      env.RESEND_API_KEY !== undefined &&
      env.EMAIL_FROM !== undefined);
  return {
    // RESEND_API_KEY is guaranteed by envSchema when resend is selected.
    provider:
      useResend && env.RESEND_API_KEY !== undefined
        ? { kind: 'resend', apiKey: env.RESEND_API_KEY, apiBaseUrl: env.RESEND_API_BASE_URL }
        : { kind: 'log' },
    from: env.EMAIL_FROM ?? DEFAULT_LOG_SENDER,
    replyTo: env.EMAIL_REPLY_TO,
  };
}

function toSchedulingProviderConfig(
  env: z.output<typeof envSchema>,
): SchedulingProviderConfig | undefined {
  // Required values are guaranteed by envSchema's refinement.
  if (env.SCHEDULING_PROVIDER === 'calcom' && env.CALCOM_BOOKING_URL && env.CALCOM_WEBHOOK_SECRET) {
    return {
      kind: 'calcom',
      bookingUrl: env.CALCOM_BOOKING_URL,
      webhookSecret: env.CALCOM_WEBHOOK_SECRET,
      apiKey: env.CALCOM_API_KEY,
      apiBaseUrl: env.CALCOM_API_BASE_URL,
      apiVersion: env.CALCOM_API_VERSION,
    };
  }
  if (env.SCHEDULING_PROVIDER === 'mock' && env.MOCK_SCHEDULING_WEBHOOK_SECRET) {
    return { kind: 'mock', webhookSecret: env.MOCK_SCHEDULING_WEBHOOK_SECRET };
  }
  return undefined;
}

function toStaffAuthConfig(
  supabaseUrl: string | undefined,
  jwtSecret: string | undefined,
  audience: string,
): StaffAuthConfig | undefined {
  if (supabaseUrl === undefined) return undefined;
  const base = new URL(supabaseUrl).origin;
  return {
    issuer: `${base}/auth/v1`,
    audience,
    jwksUrl: `${base}/auth/v1/.well-known/jwks.json`,
    jwtSecret,
  };
}

/** Database-only configuration for scripts (migrations, seeding). */
export function loadDatabaseConfig(source: NodeJS.ProcessEnv = process.env): {
  env: NodeEnv;
  database: DatabaseConfig;
} {
  const env = parseOrThrow(databaseEnvSchema, source);
  return { env: env.NODE_ENV, database: toDatabaseConfig(env) };
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = parseOrThrow(envSchema, source);
  const isProduction = env.NODE_ENV === 'production';

  return {
    env: env.NODE_ENV,
    isProduction,
    server: {
      host: env.HOST,
      port: env.PORT,
      trustProxy: env.TRUST_PROXY,
      bodyLimitBytes: env.BODY_LIMIT_BYTES,
      shutdownTimeoutMs: env.SHUTDOWN_TIMEOUT_MS,
      requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    },
    logging: { level: env.LOG_LEVEL, pretty: env.LOG_PRETTY },
    cors: { allowedOrigins: env.CORS_ALLOWED_ORIGINS },
    rateLimit: { max: env.RATE_LIMIT_MAX, windowMs: env.RATE_LIMIT_WINDOW_MS },
    docs: { enabled: env.API_DOCS_ENABLED ?? !isProduction },
    content: { cacheMaxAgeSeconds: env.CONTENT_CACHE_MAX_AGE_SECONDS },
    contact: {
      rateLimit: {
        max: env.CONTACT_RATE_LIMIT_MAX,
        windowMs: env.CONTACT_RATE_LIMIT_WINDOW_MS,
      },
    },
    applications: {
      rateLimit: {
        max: env.APPLICATION_RATE_LIMIT_MAX,
        windowMs: env.APPLICATION_RATE_LIMIT_WINDOW_MS,
      },
      statusTokenTtlMs: env.APPLICATION_STATUS_TOKEN_TTL_HOURS * 60 * 60 * 1000,
    },
    staffAuth: toStaffAuthConfig(
      env.SUPABASE_URL,
      env.SUPABASE_JWT_SECRET,
      env.STAFF_AUTH_AUDIENCE,
    ),
    scheduling: {
      provider: toSchedulingProviderConfig(env),
      tokenTtlMs: env.SCHEDULING_TOKEN_TTL_HOURS * 60 * 60 * 1000,
      pageUrl: env.SCHEDULING_PAGE_URL,
    },
    email: toEmailConfig(env),
    notifications: {
      workerEnabled: env.NOTIFICATIONS_WORKER_ENABLED,
      pollIntervalMs: env.NOTIFICATIONS_POLL_INTERVAL_MS,
      batchSize: env.NOTIFICATIONS_BATCH_SIZE,
      maxAttempts: env.NOTIFICATIONS_MAX_ATTEMPTS,
      staffRecipients: env.STAFF_NOTIFICATION_EMAILS,
      adminDashboardUrl: env.ADMIN_DASHBOARD_URL,
    },
    analytics: {
      rateLimit: {
        max: env.ANALYTICS_RATE_LIMIT_MAX,
        windowMs: env.ANALYTICS_RATE_LIMIT_WINDOW_MS,
      },
    },
    database: toDatabaseConfig(env),
  };
}
