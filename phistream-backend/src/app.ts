import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { API_V1_PREFIX } from './config/constants.js';
import type { AppConfig } from './config/env.js';
import type { Database } from './db/client.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { createAnalyticsRepository } from './modules/analytics/analytics.repository.js';
import { analyticsRoutes } from './modules/analytics/analytics.routes.js';
import {
  createAnalyticsService,
  type AnalyticsService,
} from './modules/analytics/analytics.service.js';
import { createAdminRepository } from './modules/admin/admin.repository.js';
import { createAdminService, type AdminService } from './modules/admin/admin.service.js';
import { createStaffDirectory, type StaffDirectory } from './modules/admin/staff.repository.js';
import {
  createApplicationReviewService,
  type ApplicationReviewService,
} from './modules/applications/application-review.service.js';
import { applicationRoutes } from './modules/applications/applications.routes.js';
import { createApplicationsRepository } from './modules/applications/applications.repository.js';
import {
  createApplicationsService,
  type ApplicationsService,
} from './modules/applications/applications.service.js';
import { createContentRepository } from './modules/content/content.repository.js';
import { contentRoutes } from './modules/content/content.routes.js';
import { createContentService, type ContentService } from './modules/content/content.service.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { contactRoutes } from './modules/leads/contact.routes.js';
import { createContactService, type ContactService } from './modules/leads/contact.service.js';
import { createLeadsRepository } from './modules/leads/leads.repository.js';
import {
  schedulingRoutes,
  schedulingWebhookRoutes,
} from './modules/scheduling/scheduling.routes.js';
import { createSchedulingRepository } from './modules/scheduling/scheduling.repository.js';
import {
  createSchedulingService,
  type SchedulingService,
} from './modules/scheduling/scheduling.service.js';
import { createNotificationDispatcher } from './modules/notifications/dispatcher.js';
import { createNotificationContext } from './modules/notifications/notification-context.js';
import { createNotificationsRepository } from './modules/notifications/notifications.repository.js';
import { createNotificationWorker } from './modules/notifications/worker.js';
import corsPlugin from './plugins/cors/index.js';
import rateLimitPlugin from './plugins/rate-limit/index.js';
import securityHeadersPlugin from './plugins/security-headers/index.js';
import swaggerPlugin from './plugins/swagger/index.js';
import type { EmailProvider } from './providers/email/email-provider.js';
import { createEmailProvider } from './providers/email/index.js';
import { LOG_PROVIDER } from './providers/email/log-provider.js';
import { createSchedulingProvider } from './providers/scheduling/index.js';
import type { SchedulingProvider } from './providers/scheduling/scheduling-provider.js';
import {
  createSupabaseStaffTokenVerifier,
  type StaffTokenVerifier,
} from './providers/auth/staff-token-verifier.js';
import { createPublicFormSpamGuard } from './shared/anti-spam/checks.js';
import type { HumanVerifier } from './shared/anti-spam/human-verifier.js';
import { errorHandler, notFoundHandler } from './shared/errors/error-handler.js';
import { generateRequestId, REQUEST_ID_HEADER } from './shared/http/request-id.js';
import { buildLoggerOptions } from './shared/logging/logger-options.js';

/**
 * Fastify's types omit the numeric hop-count form, so express it as the
 * equivalent function: trust the first N hops closest to this server.
 */
function toFastifyTrustProxy(
  value: AppConfig['server']['trustProxy'],
): FastifyServerOptions['trustProxy'] {
  if (typeof value === 'number') return (_address: string, hop: number) => hop < value;
  return value;
}

function requireDb(database: Database | undefined): Database {
  if (!database) throw new Error('a database is required to build this service');
  return database;
}

const HEALTH_PATHS = new Set(
  ['/health', '/health/ready'].flatMap((path) => [path, `${API_V1_PREFIX}${path}`]),
);

export interface BuildAppOptions {
  readonly config: AppConfig;
  /**
   * Database handle. The app takes ownership and closes it on shutdown.
   * Optional so HTTP-only tests can run without PostgreSQL.
   */
  readonly database?: Database;
  /**
   * Service overrides (tests). By default services are built from `database`;
   * feature routes that need a service are not registered without one.
   */
  readonly services?: {
    readonly content?: ContentService;
    readonly contact?: ContactService;
    readonly applications?: ApplicationsService;
    readonly admin?: AdminService;
    readonly review?: ApplicationReviewService;
    readonly staffDirectory?: StaffDirectory;
    readonly scheduling?: SchedulingService;
    readonly analytics?: AnalyticsService;
  };
  /**
   * Scheduling provider override (tests). By default it is built from
   * `config.scheduling.provider`; without one, scheduling answers 503/404.
   */
  readonly schedulingProvider?: SchedulingProvider;
  /** Email provider override (tests). By default built from `config.email`. */
  readonly emailProvider?: EmailProvider;
  /**
   * Run the notification worker (outbox → email) while the app is up.
   * server.ts enables it from config; tests drive the dispatcher directly.
   */
  readonly runNotificationWorker?: boolean;
  /**
   * Human-verification (CAPTCHA) adapter for public forms. None is wired until
   * the business chooses a provider; the other spam checks always run.
   */
  readonly humanVerifier?: HumanVerifier;
  /**
   * Staff token verifier override (tests). By default it is built from
   * `config.staffAuth` (Supabase Auth); without it the admin API answers 503.
   */
  readonly staffTokenVerifier?: StaffTokenVerifier;
  /** Optional log destination (used by tests to assert on log output). */
  readonly logStream?: { write(message: string): void };
}

/**
 * Builds a fully configured Fastify instance without binding a port, so tests
 * can exercise it via `app.inject()`. `server.ts` owns listening and shutdown.
 */
export async function buildApp({
  config,
  database,
  services,
  humanVerifier,
  staffTokenVerifier,
  schedulingProvider,
  emailProvider,
  runNotificationWorker = false,
  logStream,
}: BuildAppOptions) {
  const app = Fastify({
    logger: { ...buildLoggerOptions(config), ...(logStream ? { stream: logStream } : {}) },
    genReqId: generateRequestId,
    requestIdHeader: false,
    logController: new LogController({
      requestIdLogLabel: 'requestId',
      // Health probes run every few seconds; logging each one is pure noise.
      disableRequestLogging: (request) => HEALTH_PATHS.has(request.routeOptions.url ?? ''),
    }),
    // Router-level failures (malformed URL encoding, over-long path params)
    // otherwise bypass the error handler and echo the raw path.
    frameworkErrors: (error, request, reply) => {
      void errorHandler(error, request, reply);
    },
    bodyLimit: config.server.bodyLimitBytes,
    // Without it, a client trickling a request could hold a connection forever.
    requestTimeout: config.server.requestTimeoutMs,
    trustProxy: toFastifyTrustProxy(config.server.trustProxy),
  });

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Registered first so the header is present even when a later hook (e.g. the
  // rate limiter) short-circuits the request.
  app.addHook('onRequest', async (request, reply) => {
    reply.header(REQUEST_ID_HEADER, request.id);
  });

  app.setErrorHandler(errorHandler);

  if (database) {
    app.addHook('onClose', async () => {
      await database.close();
    });
  }

  await app.register(securityHeadersPlugin, { hsts: config.isProduction });
  await app.register(corsPlugin, { allowedOrigins: config.cors.allowedOrigins });
  await app.register(rateLimitPlugin, {
    max: config.rateLimit.max,
    windowMs: config.rateLimit.windowMs,
  });
  await app.register(swaggerPlugin, { exposeUi: config.docs.enabled });

  // Unknown routes are rate-limited too, to slow down path scanning.
  app.setNotFoundHandler({ preHandler: app.rateLimit() }, notFoundHandler);

  // Root-level health check for load balancers / container orchestrators.
  await app.register(healthRoutes, { database, documented: false });

  // Composition root: wire services from their dependencies.
  const contentService =
    services?.content ??
    (database
      ? createContentService({
          repository: createContentRepository(database.db),
          logger: app.log.child({ module: 'content' }),
        })
      : undefined);

  const contactLogger = app.log.child({ module: 'contact' });
  const contactService =
    services?.contact ??
    (database
      ? createContactService({
          repository: createLeadsRepository(database.db),
          spamGuard: createPublicFormSpamGuard({ humanVerifier, logger: contactLogger }),
          logger: contactLogger,
        })
      : undefined);

  const applicationsLogger = app.log.child({ module: 'applications' });
  const applicationsService =
    services?.applications ??
    (database
      ? createApplicationsService({
          repository: createApplicationsRepository(database.db),
          spamGuard: createPublicFormSpamGuard({ humanVerifier, logger: applicationsLogger }),
          logger: applicationsLogger,
          policy: { statusTokenTtlMs: config.applications.statusTokenTtlMs },
        })
      : undefined);

  // Scheduling: provider adapter from config (Cal.com / mock), domain service.
  const provider = schedulingProvider ?? createSchedulingProvider(config.scheduling.provider);
  const schedulingService =
    services?.scheduling ??
    (database
      ? createSchedulingService({
          repository: provider ? createSchedulingRepository(database.db, provider.name) : undefined,
          provider,
          tokenTtlMs: config.scheduling.tokenTtlMs,
          pageUrl: config.scheduling.pageUrl,
          logger: app.log.child({ module: 'scheduling' }),
        })
      : undefined);

  const analyticsService =
    services?.analytics ??
    (database
      ? createAnalyticsService({ repository: createAnalyticsRepository(database.db) })
      : undefined);

  // Notifications: outbox → email through the configured provider.
  const notificationsRepository = database ? createNotificationsRepository(database.db) : undefined;
  if (database && notificationsRepository) {
    const notificationsLogger = app.log.child({ module: 'notifications' });
    const mailer = emailProvider ?? createEmailProvider(config.email, notificationsLogger);
    if (mailer.name === LOG_PROVIDER) {
      (config.isProduction ? notificationsLogger.warn : notificationsLogger.info).call(
        notificationsLogger,
        'email provider is "log": notifications are recorded but not delivered',
      );
    }
    const dispatcher = createNotificationDispatcher({
      repository: notificationsRepository,
      context: createNotificationContext(database.db, {
        staffRecipients: config.notifications.staffRecipients,
      }),
      provider: mailer,
      scheduling: schedulingService,
      options: {
        from: config.email.from,
        replyTo: config.email.replyTo,
        adminDashboardUrl: config.notifications.adminDashboardUrl,
        batchSize: config.notifications.batchSize,
        maxAttempts: config.notifications.maxAttempts,
      },
      logger: notificationsLogger,
    });
    if (runNotificationWorker) {
      const worker = createNotificationWorker({
        dispatcher,
        intervalMs: config.notifications.pollIntervalMs,
        batchSize: config.notifications.batchSize,
        logger: notificationsLogger,
      });
      app.addHook('onReady', async () => {
        worker.start();
      });
      // Before the database pool closes (onClose).
      app.addHook('preClose', async () => {
        await worker.stop();
      });
    }
  }

  // Staff/admin API. Tokens are verified against Supabase Auth; staff identity
  // and role come from our own staff_users table.
  const verifier =
    staffTokenVerifier ??
    (config.staffAuth ? createSupabaseStaffTokenVerifier(config.staffAuth) : undefined);
  const admin =
    database || (services?.admin && services.review && services.staffDirectory)
      ? {
          adminService:
            services?.admin ??
            createAdminService({
              repository: createAdminRepository(requireDb(database).db),
              database: requireDb(database).db,
            }),
          reviewService:
            services?.review ??
            createApplicationReviewService({
              repository: createApplicationsRepository(requireDb(database).db),
            }),
          directory: services?.staffDirectory ?? createStaffDirectory(requireDb(database).db),
          schedulingService,
          notificationsRepository,
          analyticsService,
        }
      : undefined;
  if (admin && !verifier) {
    app.log.warn(
      'staff authentication is not configured (SUPABASE_URL); the admin API answers 503',
    );
  }

  // Versioned public/admin API. Feature modules are registered here.
  await app.register(
    async (v1) => {
      await v1.register(healthRoutes, { database });
      if (contentService) {
        await v1.register(contentRoutes, {
          prefix: '/content',
          service: contentService,
          cacheMaxAgeSeconds: config.content.cacheMaxAgeSeconds,
        });
      }
      if (contactService) {
        await v1.register(contactRoutes, {
          service: contactService,
          rateLimit: config.contact.rateLimit,
        });
      }
      if (applicationsService) {
        await v1.register(applicationRoutes, {
          service: applicationsService,
          rateLimit: config.applications.rateLimit,
          formCacheMaxAgeSeconds: config.content.cacheMaxAgeSeconds,
        });
      }
      if (analyticsService) {
        await v1.register(analyticsRoutes, {
          service: analyticsService,
          rateLimit: config.analytics.rateLimit,
        });
      }
      if (schedulingService) {
        await v1.register(schedulingRoutes, { service: schedulingService });
        await v1.register(schedulingWebhookRoutes, { service: schedulingService });
      }
      if (admin) {
        await v1.register(adminRoutes, { prefix: '/admin', verifier, ...admin });
      }
    },
    { prefix: API_V1_PREFIX },
  );

  return app.withTypeProvider<ZodTypeProvider>();
}

export type App = Awaited<ReturnType<typeof buildApp>>;
