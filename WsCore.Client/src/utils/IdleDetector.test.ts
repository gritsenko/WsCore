import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import IdleDetector, { IdleEventTarget } from './IdleDetector';

/** Minimal event target: records listeners so the test can fire "user input". */
class FakeTarget implements IdleEventTarget {
  listeners = new Map<string, () => void>();
  addEventListener(type: string, listener: () => void): void {
    this.listeners.set(type, listener);
  }
  removeEventListener(type: string): void {
    this.listeners.delete(type);
  }
  fire(type = 'pointermove'): void {
    this.listeners.get(type)?.();
  }
}

describe('IdleDetector', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(timeoutMs = 1000) {
    const target = new FakeTarget();
    const changes: boolean[] = [];
    const detector = new IdleDetector(target, away => changes.push(away), timeoutMs);
    detector.start();
    return { target, changes, detector };
  }

  it('reports away after the timeout without input, and back on the next input', () => {
    const { target, changes } = setup();

    vi.advanceTimersByTime(999);
    expect(changes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(changes).toEqual([true]);

    target.fire('keydown');
    expect(changes).toEqual([true, false]);
  });

  it('input keeps postponing away, without reporting anything', () => {
    const { target, changes } = setup();

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(800);
      target.fire();
    }
    expect(changes).toEqual([]);

    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true]);
  });

  it('goes away again after coming back', () => {
    const { target, changes } = setup();
    vi.advanceTimersByTime(1000);
    target.fire();
    vi.advanceTimersByTime(1000);
    expect(changes).toEqual([true, false, true]);
  });

  it('stop() detaches every listener and cancels the timer', () => {
    const { target, changes, detector } = setup();
    detector.stop();

    expect(target.listeners.size).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(changes).toEqual([]);
  });
});
