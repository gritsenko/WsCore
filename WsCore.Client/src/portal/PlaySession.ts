/**
 * One play session of a game, timed from outside it (jam.my.games play.jsx
 * `usePlaySession`): what counts is **attention** time — a 1 s tick credits the slice
 * only while the page is engaged (tab visible, window focused, no mock ad on screen), and
 * a gap longer than `MAX_TICK_MS` (a throttled or sleeping tab) is not credited at all.
 *
 * The server learns it by heartbeat: the first opens the session (a launch), then one
 * every `HEARTBEAT_MS` of *played* time, one when the tab is hidden (it may never come
 * back) and the last one, `ended`, on leaving. The server clamps what it is told; a lost
 * last beat costs only the seconds since the previous one (and the server closes the
 * session when the socket goes).
 *
 * The game's own events (`Jam.levelComplete` / `Jam.logEvent`) and the mock-ad events are
 * buffered and ride the heartbeat — or go early once `EVENT_FLUSH_AT` are queued — so a
 * game logging from its update loop cannot flood the socket.
 */

export const TICK_MS = 1_000;
export const HEARTBEAT_MS = 20_000;
export const MAX_TICK_MS = 3 * TICK_MS;
export const EVENT_FLUSH_AT = 20;
/** Never more than this queued (a runaway game); the server caps a session anyway. */
export const EVENT_BUFFER_MAX = 200;

export interface PlayEvent {
  name: string;
  level: string;
  params: string;
}

export interface PlaySessionDeps {
  now(): number;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  /** Tab visible, window focused, no mock ad: the time counts. */
  engaged(): boolean;
  sendBeat(activeMs: number, ended: boolean): void;
  sendEvents(events: PlayEvent[]): void;
}

/** A fresh session id: 32 hex characters (what the server accepts). */
export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export default class PlaySession {
  private activeMs = 0;
  private sentMs = 0;
  private last = 0;
  private timer: unknown = null;
  private events: PlayEvent[] = [];
  private running = false;

  constructor(private readonly deps: PlaySessionDeps) {}

  get playedMs(): number {
    return this.activeMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = this.deps.now();
    this.deps.sendBeat(0, false); // opens the session server-side right away
    this.timer = this.deps.setInterval(() => this.tick(), TICK_MS);
  }

  /** The tab went hidden: report now — this may be the last thing we ever get to send. */
  hidden(): void {
    if (!this.running) return;
    this.tick();
    this.beat();
  }

  event(name: string, level: string, params: string): void {
    if (!this.running || this.events.length >= EVENT_BUFFER_MAX) return;
    this.events.push({ name, level, params });
    if (this.events.length >= EVENT_FLUSH_AT) this.flush();
  }

  /** Leaving the game: the last beat. Idempotent. */
  stop(): void {
    if (!this.running) return;
    this.tick();
    this.flush(); // while the session is still open server-side
    this.deps.sendBeat(Math.round(this.activeMs), true);
    this.running = false;
    this.deps.clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const now = this.deps.now();
    const dt = now - this.last;
    this.last = now;
    if (dt > 0 && dt <= MAX_TICK_MS && this.deps.engaged()) this.activeMs += dt;
    if (this.activeMs - this.sentMs >= HEARTBEAT_MS) this.beat();
  }

  private beat(): void {
    this.sentMs = this.activeMs;
    this.deps.sendBeat(Math.round(this.activeMs), false);
    this.flush();
  }

  private flush(): void {
    if (this.events.length === 0) return;
    this.deps.sendEvents(this.events.splice(0, this.events.length));
  }
}
