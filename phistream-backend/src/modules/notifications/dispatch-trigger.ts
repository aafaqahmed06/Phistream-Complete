import type { DispatchSummary, NotificationDispatcher } from './dispatcher.js';

/**
 * Runs the dispatcher on demand, for hosts where the polling worker cannot be
 * trusted to run (serverless functions are paused between requests).
 *
 * `kick()` starts one background pass and returns immediately; a kick during
 * a pass schedules exactly one more, so an event queued mid-pass is not left
 * behind. `keepAlive` receives the pass so the host can stay up until it
 * finishes (Vercel's `waitUntil`); elsewhere the pass simply runs.
 */
export interface DispatchTrigger {
  kick(): void;
  /** One pass, awaited (the scheduled sweep endpoint). */
  runNow(): Promise<DispatchSummary>;
}

export function createDispatchTrigger(deps: {
  dispatcher: NotificationDispatcher;
  keepAlive: (pass: Promise<unknown>) => void;
  logger: { error(object: object, message: string): void };
}): DispatchTrigger {
  let running: Promise<void> | undefined;
  let again = false;

  // Read through a function: `kick()` can set `again` while a pass awaits,
  // which control-flow narrowing inside `drain` cannot see.
  const rerunRequested = () => again;

  async function drain(): Promise<void> {
    do {
      again = false;
      await deps.dispatcher.runOnce();
    } while (rerunRequested());
  }

  return {
    kick() {
      if (running) {
        again = true;
        return;
      }
      running = drain()
        .catch((error: unknown) => {
          deps.logger.error({ err: error }, 'notification dispatch after response failed');
        })
        .finally(() => {
          running = undefined;
        });
      deps.keepAlive(running);
    },
    runNow: () => deps.dispatcher.runOnce(),
  };
}
