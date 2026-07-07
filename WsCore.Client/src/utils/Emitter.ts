/**
 * Minimal typed event emitter.
 *
 * `on()` returns an unsubscribe handle so subscribers (lobby / game states) can
 * detach cleanly on teardown instead of the caller recreating the whole client.
 */
export type Unsubscribe = () => void;

export default class Emitter<Events extends Record<string, (...args: any[]) => void>> {
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
      fn(...args);
    }
  }

  /** Remove every listener (used on final shutdown). */
  clear(): void {
    this.listeners = {};
  }
}
