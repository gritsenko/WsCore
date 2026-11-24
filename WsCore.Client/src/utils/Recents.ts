/**
 * A short most-recent-first list kept in `localStorage` (the chat picker's «Недавние»).
 * Storage may be missing or throwing (private mode, quota): then the list just lives
 * for the page.
 */
export default class Recents {
  private items: string[];

  constructor(
    private readonly key: string,
    private readonly max = 24,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = defaultStorage()
  ) {
    this.items = this.load();
  }

  get list(): readonly string[] {
    return this.items;
  }

  /** Moves `value` to the front (adding it if new), keeping at most `max`. */
  push(value: string): void {
    this.items = [value, ...this.items.filter(v => v !== value)].slice(0, this.max);
    try {
      this.storage?.setItem(this.key, JSON.stringify(this.items));
    } catch {
      // not remembered across pages
    }
  }

  private load(): string[] {
    try {
      const parsed: unknown = JSON.parse(this.storage?.getItem(this.key) ?? '[]');
      return Array.isArray(parsed)
        ? parsed.filter((v): v is string => typeof v === 'string').slice(0, this.max)
        : [];
    } catch {
      return [];
    }
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}
