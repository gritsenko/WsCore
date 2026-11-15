/**
 * Minimal typed event emitter.
 *
 * `Events` maps each event name to its listener signature; `on()`/`emit()` are
 * checked against it. `on()` returns an unsubscribe handle so subscribers (lobby /
 * game states) can detach cleanly on teardown instead of the caller recreating the
 * whole client.
 */
export type Unsubscribe = () => void;

/** Constraint for an event map: every entry is a listener function. */
export type EventMap<Events> = { [K in keyof Events]: (...args: never[]) => void };

export default class Emitter<Events extends EventMap<Events>> {
  private listeners: { [K in keyof Events]?: Set<Events[K]> } = {};

  on<K extends keyof Events>(event: K, fn: Events[K]): Unsubscribe {
    let set = this.listeners[event];
    if (!set) {
      set = new Set<Events[K]>();
      this.listeners[event] = set;
    }
    set.add(fn);
    return () => {
      this.listeners[event]?.delete(fn);
    };
  }

  emit<K extends keyof Events>(event: K, ...args: Parameters<Events[K]>): void {
    const set = this.listeners[event];
    if (!set) return;
    // Copy so a handler that unsubscribes mid-dispatch doesn't mutate the live set.
    for (const fn of Array.from(set)) {
      (fn as (...a: Parameters<Events[K]>) => void)(...args);
    }
  }

  /** Remove every listener (used on final shutdown). */
  clear(): void {
    this.listeners = {};
  }
}
