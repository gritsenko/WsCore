import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import UpdateChecker, { UpdateCheckerDeps } from './UpdateChecker';

function setup(initial: string | null = 'a') {
  const state = { build: initial as string | null, fails: false, fetches: 0 };
  let visible: (() => void) | null = null;
  const deps: UpdateCheckerDeps = {
    async fetchBuild() {
      state.fetches++;
      if (state.fails) throw new Error('offline');
      return state.build;
    },
    onVisible(listener) {
      visible = listener;
      return () => (visible = null);
    },
  };
  const checker = new UpdateChecker('a', deps, 1000);
  const onUpdate = vi.fn();
  checker.onUpdate(onUpdate);
  return { state, checker, onUpdate, show: () => visible?.(), isListening: () => visible !== null };
}

describe('UpdateChecker', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('stays quiet while the server serves our build', async () => {
    const t = setup();
    t.checker.start();
    await vi.advanceTimersByTimeAsync(3500);
    expect(t.state.fetches).toBe(4); // at start + three intervals
    expect(t.checker.updateAvailable).toBe(false);
    expect(t.onUpdate).not.toHaveBeenCalled();
  });

  it('reports a different build once and stops polling', async () => {
    const t = setup();
    t.checker.start();
    await vi.advanceTimersByTimeAsync(0);
    t.state.build = 'b';
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.checker.updateAvailable).toBe(true);
    expect(t.onUpdate).toHaveBeenCalledTimes(1);

    const fetches = t.state.fetches;
    await vi.advanceTimersByTimeAsync(5000);
    await t.checker.check();
    expect(t.state.fetches).toBe(fetches);
    expect(t.onUpdate).toHaveBeenCalledTimes(1);
    expect(t.isListening()).toBe(false);
  });

  it('checks when the page is shown again', async () => {
    const t = setup();
    t.checker.start();
    await vi.advanceTimersByTimeAsync(0);
    t.state.build = 'b';
    t.show();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.onUpdate).toHaveBeenCalledTimes(1);
  });

  it('treats a failed or unreadable answer as "not known yet"', async () => {
    const t = setup(null);
    t.checker.start();
    await vi.advanceTimersByTimeAsync(0);
    t.state.fails = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.checker.updateAvailable).toBe(false);

    t.state.fails = false;
    t.state.build = 'b';
    await vi.advanceTimersByTimeAsync(1000);
    expect(t.checker.updateAvailable).toBe(true);
  });

  it('stop() ends polling', async () => {
    const t = setup();
    t.checker.start();
    await vi.advanceTimersByTimeAsync(0);
    t.checker.stop();
    t.state.build = 'b';
    await vi.advanceTimersByTimeAsync(5000);
    expect(t.state.fetches).toBe(1);
    expect(t.onUpdate).not.toHaveBeenCalled();
  });
});
