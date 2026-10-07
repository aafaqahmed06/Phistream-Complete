import { describe, expect, it, vi } from 'vitest';

import { createDispatchTrigger } from '../../src/modules/notifications/dispatch-trigger.js';
import type { DispatchSummary } from '../../src/modules/notifications/dispatcher.js';

const SUMMARY: DispatchSummary = { claimed: 0, released: 0, processed: 0, retried: 0, failed: 0 };

const settle = () => new Promise((resolve) => setImmediate(resolve));

/** A dispatcher whose passes finish only when the test says so. */
function controlledDispatcher() {
  const finishers: (() => void)[] = [];
  const runOnce = vi.fn(
    () =>
      new Promise<DispatchSummary>((resolve) => {
        finishers.push(() => {
          resolve(SUMMARY);
        });
      }),
  );
  const finishNext = async () => {
    finishers.shift()?.();
    await settle();
  };
  return { runOnce, finishNext };
}

function build(runOnce: () => Promise<DispatchSummary>) {
  const keepAlive = vi.fn();
  const error = vi.fn();
  const trigger = createDispatchTrigger({ dispatcher: { runOnce }, keepAlive, logger: { error } });
  return { trigger, keepAlive, error };
}

describe('createDispatchTrigger', () => {
  it('runs one pass and hands it to keepAlive', async () => {
    const { runOnce, finishNext } = controlledDispatcher();
    const { trigger, keepAlive } = build(runOnce);

    trigger.kick();
    expect(runOnce).toHaveBeenCalledTimes(1);
    expect(keepAlive).toHaveBeenCalledTimes(1);
    expect(keepAlive.mock.calls[0]?.[0]).toBeInstanceOf(Promise);

    await finishNext();
    expect(runOnce).toHaveBeenCalledTimes(1);
  });

  it('runs exactly one more pass when kicked during a pass', async () => {
    const { runOnce, finishNext } = controlledDispatcher();
    const { trigger, keepAlive } = build(runOnce);

    trigger.kick();
    trigger.kick();
    trigger.kick();
    expect(runOnce).toHaveBeenCalledTimes(1);

    await finishNext();
    expect(runOnce).toHaveBeenCalledTimes(2);
    await finishNext();
    expect(runOnce).toHaveBeenCalledTimes(2);
    expect(keepAlive).toHaveBeenCalledTimes(1);

    // Idle again: a new kick starts a new pass.
    trigger.kick();
    expect(runOnce).toHaveBeenCalledTimes(3);
  });

  it('logs a failed pass instead of rejecting, and recovers', async () => {
    const runOnce = vi
      .fn<() => Promise<DispatchSummary>>()
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue(SUMMARY);
    const { trigger, error } = build(runOnce);

    trigger.kick();
    await settle();
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) }),
      'notification dispatch after response failed',
    );

    trigger.kick();
    expect(runOnce).toHaveBeenCalledTimes(2);
  });

  it('runNow awaits a single pass and returns its summary', async () => {
    const runOnce = vi.fn<() => Promise<DispatchSummary>>().mockResolvedValue(SUMMARY);
    const { trigger } = build(runOnce);
    await expect(trigger.runNow()).resolves.toEqual(SUMMARY);
  });
});
