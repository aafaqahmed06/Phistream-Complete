import { buildApp, type App } from './app.js';
import { ConfigError, loadConfig, type AppConfig } from './config/env.js';
import { createDatabase } from './db/client.js';
import { registerGracefulShutdown } from './shared/lifecycle/graceful-shutdown.js';

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigError) {
      // The logger is not configured yet; write directly to stderr.
      process.stderr.write(`${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

async function main(): Promise<void> {
  const config = loadConfigOrExit();
  const databaseUrl = config.database.url;
  if (databaseUrl === undefined) {
    // Only possible with NODE_ENV=test, which is not meant for running the server.
    throw new ConfigError(['DATABASE_URL: is required to run the server']);
  }

  // The pool connects lazily; the app owns it and closes it on shutdown.
  // Pool errors are routed to the app logger once the app exists.
  const logTarget: { app?: App } = {};
  const database = createDatabase(
    { ...config.database, url: databaseUrl },
    {
      error: (object, message) => {
        logTarget.app?.log.error(object, message);
      },
    },
  );
  const app = await buildApp({
    config,
    database,
    runNotificationWorker: config.notifications.workerEnabled,
  });
  logTarget.app = app;

  if (config.isProduction && config.database.ssl === 'disable') {
    app.log.warn('DATABASE_SSL=disable in production: database traffic is not encrypted');
  }

  registerGracefulShutdown({ app, timeoutMs: config.server.shutdownTimeoutMs });

  process.on('unhandledRejection', (reason) => {
    app.log.fatal({ err: reason }, 'unhandled promise rejection');
    process.exit(1);
  });
  process.on('uncaughtException', (error) => {
    app.log.fatal({ err: error }, 'uncaught exception');
    process.exit(1);
  });

  try {
    await app.listen({ host: config.server.host, port: config.server.port });
  } catch (error) {
    app.log.fatal({ err: error }, 'failed to start server');
    process.exit(1);
  }

  // Report (but do not exit on) an unreachable database: /health/ready will
  // stay unhealthy until it recovers, and the platform can route accordingly.
  database.ping().then(
    () => {
      app.log.info('database connection verified');
    },
    (error: unknown) => {
      app.log.error({ err: error }, 'database is not reachable at startup');
    },
  );
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Fatal startup error: ${error instanceof Error ? error.stack : String(error)}\n`,
  );
  process.exit(1);
});
