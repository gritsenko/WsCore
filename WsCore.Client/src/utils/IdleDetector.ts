/** The DOM surface the detector needs — injectable so it is testable without a DOM. */
export interface IdleEventTarget {
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: () => void): void;
}

const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];

/**
 * Tells when the user went idle (no input for `timeoutMs`) and when they came back —
 * the "away" (afk) half of presence, which only the client can know: someone reading
 * the lobby sends nothing to the server.
 *
 * Cheap by construction: activity events only stamp a time (passive listeners, no
 * timer churn on every mouse move); one timer re-arms itself for the remaining time.
 * A hidden tab produces no input, so it goes away after the same timeout.
 */
export default class IdleDetector {
  static readonly DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

  private readonly target: IdleEventTarget;
  private readonly timeoutMs: number;
  private readonly onChange: (away: boolean) => void;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastActivityAt = 0;
  private away = false;
  private running = false;

  constructor(
    target: IdleEventTarget,
    onChange: (away: boolean) => void,
    timeoutMs = IdleDetector.DEFAULT_TIMEOUT_MS
  ) {
    this.target = target;
    this.onChange = onChange;
    this.timeoutMs = timeoutMs;
  }

  get isAway(): boolean {
    return this.away;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastActivityAt = Date.now();
    for (const type of ACTIVITY_EVENTS) {
      this.target.addEventListener(type, this.onActivity, { passive: true, capture: true });
    }
    this.arm(this.timeoutMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const type of ACTIVITY_EVENTS) this.target.removeEventListener(type, this.onActivity);
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private readonly onActivity = (): void => {
    this.lastActivityAt = Date.now();
    if (this.away) {
      this.away = false;
      this.arm(this.timeoutMs);
      this.onChange(false);
    }
  };

  private arm(delayMs: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.check(), delayMs);
  }

  private check(): void {
    this.timer = null;
    if (!this.running || this.away) return;
    const idleFor = Date.now() - this.lastActivityAt;
    if (idleFor >= this.timeoutMs) {
      this.away = true; // the next activity event flips it back
      this.onChange(true);
    } else {
      this.arm(this.timeoutMs - idleFor);
    }
  }
}
