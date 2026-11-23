/** What the checker needs from the browser — injectable so it is testable without one. */
export interface UpdateCheckerDeps {
  /** The build id currently deployed (from /version.json), or null if it cannot be read. */
  fetchBuild(): Promise<string | null>;
  /** Fires when the page is shown again (a tab that was hidden for hours checks at once). */
  onVisible(listener: () => void): () => void;
}

/**
 * Notices that a newer build of the client has been deployed while this page is open:
 * compares the build id compiled into the page with the one the server serves now
 * (`/version.json`, written by the Vite build). Polls rarely — plus when the tab is
 * shown again and after a reconnect (App), which is when a deploy usually happened.
 * Once an update is seen the answer is final: polling stops and listeners are told once.
 */
export default class UpdateChecker {
  static readonly DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

  private readonly currentBuild: string;
  private readonly deps: UpdateCheckerDeps;
  private readonly intervalMs: number;
  private readonly listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private offVisible: (() => void) | null = null;
  private checking = false;
  private available = false;

  constructor(
    currentBuild: string,
    deps: UpdateCheckerDeps,
    intervalMs = UpdateChecker.DEFAULT_INTERVAL_MS
  ) {
    this.currentBuild = currentBuild;
    this.deps = deps;
    this.intervalMs = intervalMs;
  }

  /** True once a build other than ours has been seen on the server. */
  get updateAvailable(): boolean {
    return this.available;
  }

  /** Subscribe to "an update is available" (fires at most once); returns the unsubscribe. */
  onUpdate(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer !== null || this.available) return;
    this.timer = setInterval(() => void this.check(), this.intervalMs);
    this.offVisible = this.deps.onVisible(() => void this.check());
    void this.check();
  }

  stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    this.offVisible?.();
    this.offVisible = null;
  }

  /** Ask the server now. Failures (offline, mid-deploy) just mean "not known yet". */
  async check(): Promise<void> {
    if (this.available || this.checking) return;
    this.checking = true;
    let build: string | null;
    try {
      build = await this.deps.fetchBuild();
    } catch {
      build = null;
    } finally {
      this.checking = false;
    }
    if (!build || build === this.currentBuild || this.available) return;

    this.available = true;
    this.stop();
    for (const listener of [...this.listeners]) listener();
  }
}

/** The real browser: `/version.json` of the page's own origin, never from a cache. */
export function browserUpdateDeps(doc: Document = document): UpdateCheckerDeps {
  return {
    async fetchBuild() {
      const response = await fetch('/version.json', { cache: 'no-store' });
      if (!response.ok) return null;
      const data = (await response.json()) as { build?: unknown };
      return typeof data.build === 'string' && data.build ? data.build : null;
    },
    onVisible(listener) {
      const handler = (): void => {
        if (doc.visibilityState === 'visible') listener();
      };
      doc.addEventListener('visibilitychange', handler);
      return () => doc.removeEventListener('visibilitychange', handler);
    },
  };
}
