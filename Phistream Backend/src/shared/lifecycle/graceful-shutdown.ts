import type { FastifyInstance } from 'fastify';

export interface GracefulShutdownOptions {
  readonly app: Pick<FastifyInstance, 'close' | 'log'>;
  /** Hard deadline after which the process exits even if close() hangs. */
  readonly timeoutMs: number;
  readonly signals?: readonly NodeJS.Signals[];
  /** Injectable for tests. */
  readonly processRef?: Pick<NodeJS.Process, 'on' | 'off'>;
  readonly exit?: (code: number) => void;
}

/**
 * On SIGTERM/SIGINT: stop accepting connections, let in-flight requests finish
 * (Fastify answers new requests with 503 while closing), run onClose hooks
 * (e.g. DB pool shutdown), then exit. A second signal or the timeout forces
 * exit with a non-zero code.
 *
 * Returns a function that removes the signal listeners.
 */
export function registerGracefulShutdown(options: GracefulShutdownOptions): () => void {
  const {
    app,
    timeoutMs,
    signals = ['SIGTERM', 'SIGINT'],
    processRef = process,
    exit = (code: number) => process.exit(code),
  } = options;

  let shuttingDown = false;

  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      app.log.warn({ signal }, 'received second shutdown signal, forcing exit');
      exit(1);
      return;
    }
    shuttingDown = true;
    app.log.info({ signal, timeoutMs }, 'shutdown started');

    const forceExitTimer = setTimeout(() => {
      app.log.error({ timeoutMs }, 'shutdown timed out, forcing exit');
      exit(1);
    }, timeoutMs);
    forceExitTimer.unref();

    app.close().then(
      () => {
        clearTimeout(forceExitTimer);
        app.log.info('shutdown complete');
        exit(0);
      },
      (error: unknown) => {
        clearTimeout(forceExitTimer);
        app.log.error({ err: error }, 'error during shutdown');
        exit(1);
      },
    );
  };

  for (const signal of signals) processRef.on(signal, onSignal);

  return () => {
    for (const signal of signals) processRef.off(signal, onSignal);
  };
}
