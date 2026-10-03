import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  registerGracefulShutdown,
  type GracefulShutdownOptions,
} from '../../src/shared/lifecycle/graceful-shutdown.js';

function setup(close: () => Promise<undefined>) {
  const processRef = new EventEmitter();
  const exit = vi.fn<(code: number) => void>();
  const closeMock = vi.fn(close);
  const app = {
    close: closeMock,
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  } as unknown as GracefulShutdownOptions['app'];

  const unregister = registerGracefulShutdown({
    app,
    timeoutMs: 1000,
    processRef: processRef as unknown as GracefulShutdownOptions['processRef'] & object,
    exit,
  });
  return { processRef, exit, closeMock, unregister };
}

describe('registerGracefulShutdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes the app and exits 0 on SIGTERM', async () => {
    const { processRef, exit, closeMock } = setup(() => Promise.resolve(undefined));
    processRef.emit('SIGTERM', 'SIGTERM');
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(0);
    });
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('exits 1 when close() rejects', async () => {
    const { processRef, exit } = setup(() => Promise.reject(new Error('boom')));
    processRef.emit('SIGINT', 'SIGINT');
    await vi.waitFor(() => {
      expect(exit).toHaveBeenCalledWith(1);
    });
  });

  it('forces exit 1 when close() exceeds the timeout', () => {
    const { processRef, exit } = setup(() => new Promise<undefined>(() => undefined));
    processRef.emit('SIGTERM', 'SIGTERM');
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('forces exit 1 on a second signal without closing twice', () => {
    const { processRef, exit, closeMock } = setup(() => new Promise<undefined>(() => undefined));
    processRef.emit('SIGTERM', 'SIGTERM');
    processRef.emit('SIGTERM', 'SIGTERM');
    expect(exit).toHaveBeenCalledWith(1);
    expect(closeMock).toHaveBeenCalledTimes(1);
  });

  it('removes its listeners when unregistered', () => {
    const { processRef, unregister } = setup(() => Promise.resolve(undefined));
    expect(processRef.listenerCount('SIGTERM')).toBe(1);
    unregister();
    expect(processRef.listenerCount('SIGTERM')).toBe(0);
    expect(processRef.listenerCount('SIGINT')).toBe(0);
  });
});
