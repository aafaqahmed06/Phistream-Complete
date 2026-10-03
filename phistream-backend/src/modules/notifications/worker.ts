import type { NotificationDispatcher } from './dispatcher.js';

/**
 * In-process polling loop around the dispatcher. Safe to run on every API
 * instance: events are claimed with leases (see notifications.repository).
 * Batches run back to back while there is a backlog, then the loop sleeps.
 * Errors are logged and never stop the loop.
 */
export interface NotificationWorker {
  start(): void;
  /** Stops polling and waits for the in-flight batch to finish. */
  stop(): Promise<void>;
}

export function createNotificationWorker(deps: {
  dispatcher: NotificationDispatcher;
  intervalMs: number;
  batchSize: number;
  logger: { error(object: object, message: string): void };
}): NotificationWorker {
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> | undefined;
  let stopped = true;
  let abort = new AbortController();

  const schedule = (delayMs: number) => {
    if (stopped) return;
    timer = setTimeout(() => {
      running = tick().finally(() => {
        running = undefined;
      });
    }, delayMs);
    // Never keep the process alive just for the worker.
    timer.unref();
  };

  async function tick(): Promise<void> {
    let delay = deps.intervalMs;
    try {
      const summary = await deps.dispatcher.runOnce({ signal: abort.signal });
      if (summary.claimed >= deps.batchSize) delay = 0; // backlog: continue now
    } catch (error) {
      deps.logger.error({ err: error }, 'notification worker batch failed');
    }
    schedule(delay);
  }

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      abort = new AbortController();
      schedule(0);
    },
    async stop() {
      stopped = true;
      // Let the event in flight finish; the rest of the batch is handed back.
      abort.abort();
      if (timer) clearTimeout(timer);
      await running;
    },
  };
}
