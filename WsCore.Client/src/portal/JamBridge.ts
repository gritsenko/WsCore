/**
 * The host half of the jam portal's game bridge (`window.Jam`, jam.my.games
 * docs/game-bridge-contract.md §4): what a game's injected `jam-sdk.js` posts to the
 * page playing it, and what that page answers. In the jam portal this is `play.jsx`; here
 * it is TOX, and the game always runs on another origin (the games origin), so the SDK
 * sends leaderboard calls through us too.
 *
 * Game → host: `{ source: 'jam-sdk', v, type, payload }`; host → game:
 * `{ source: 'jam-host', v: 1, type: 'ad' | 'lb' | 'review', payload }`.
 *
 * Pure protocol: the page (GameHost) checks that a message really comes from the game's
 * frame and origin before handing it here, and draws whatever the hooks ask for.
 */

/** A mock ad is up this long (the jam portal's numbers). */
export const AD_REWARDED_MS = 3_000;
export const AD_INTERSTITIAL_MS = 3_000;
/** After any ad ends, the next may open only after this (told to the SDK as `cooldownMs`). */
export const AD_DEBOUNCE_MS = 1_500;

export type AdFormat = 'rewarded' | 'interstitial';
export type AdResult = 'completed' | 'skipped' | 'shown';
export type LeaderboardOp = 'score' | 'entries' | 'player' | 'description';

export interface AdShow {
  id: string;
  format: AdFormat;
  /** The game draws the ad itself (`Jam.setAdUI('game')`): no card from us. */
  own: boolean;
  durationMs: number;
}

/** A refusal from the leaderboard backend; `status` 404 reads as "no such board yet". */
export class LeaderboardError extends Error {
  constructor(
    message: string,
    readonly status = 0
  ) {
    super(message);
  }
}

export interface JamBridgeHooks {
  /** Post to the game's frame (GameHost targets the frame's origin, never '*'). */
  post(type: 'ad' | 'lb' | 'review', payload: Record<string, unknown>): void;
  /** `hold`: the game asked to keep the loading screen (gameLoading); `release`: gameReady. */
  splash(state: 'hold' | 'release'): void;
  /** A mock ad starts (draw the card unless `own`) / ends. */
  adShow(show: AdShow): void;
  adEnd(id: string): void;
  /** Leaderboard calls; absent = boards are not available (the SDK gets its fallback). */
  leaderboard?(op: LeaderboardOp, board: string, args: Record<string, unknown>): Promise<unknown>;
  /** `Jam.levelComplete` / `Jam.logEvent` (all strings, as the SDK sends them). */
  event?(name: string, level: string, params: string): void;
  vibrate?(pattern: number | number[]): void;
  /** Console line for authors debugging an integration. */
  log?(kind: string, text: string): void;
}

export interface BridgeTimers {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultTimers: BridgeTimers = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: h => clearTimeout(h as ReturnType<typeof setTimeout>),
};

const LB_OPS = new Set<LeaderboardOp>(['score', 'entries', 'player', 'description']);
const BOARD_RE = /^[a-z0-9_]{1,64}$/;

export default class JamBridge {
  private current: (AdShow & { timer: unknown }) | null = null;
  private lastAdEnd = -Infinity;
  private destroyed = false;

  constructor(
    private readonly hooks: JamBridgeHooks,
    private readonly timers: BridgeTimers = defaultTimers
  ) {}

  /** Whether a mock ad is on screen (playtime should not run meanwhile). */
  get adShowing(): boolean {
    return this.current !== null;
  }

  /** A message from the game's frame (already checked to be from it). Anything else is ignored. */
  receive(data: unknown): void {
    if (this.destroyed || !data || typeof data !== 'object') return;
    const d = data as { source?: unknown; type?: unknown; payload?: unknown };
    if (d.source !== 'jam-sdk' || typeof d.type !== 'string') return;
    const p = (d.payload && typeof d.payload === 'object' ? d.payload : {}) as Record<
      string,
      unknown
    >;
    switch (d.type) {
      case 'hello':
        this.hooks.log?.(
          'connected',
          `jam-sdk v${String(p.sdk ?? '?')} · game ${String(p.game ?? '')}`
        );
        return;
      case 'notice':
        this.hooks.log?.(String(p.kind ?? 'call'), String(p.text ?? '').slice(0, 400));
        return;
      case 'loading':
        this.hooks.splash('hold');
        return;
      case 'ready':
        this.hooks.splash('release');
        return;
      case 'event': {
        if (!p.name) return;
        // `ad_*` are the page's own (the impressions it served): a game cannot mint them.
        const name = String(p.name);
        this.hooks.event?.(
          name.startsWith('ad_') ? `game_${name}` : name,
          String(p.level ?? ''),
          String(p.params ?? '')
        );
        return;
      }
      case 'haptics':
        this.haptics(p.pattern);
        return;
      case 'review-request':
        // No store-review simulation here (yet): the SDK resolves { status: 'unavailable' }.
        if (typeof p.id === 'string' && p.id && p.id.length <= 120)
          this.hooks.post('review', { id: p.id, status: 'unavailable' });
        return;
      case 'lb':
        this.leaderboard(p);
        return;
      case 'ad-request':
        this.requestAd(p);
        return;
      case 'ad-tap':
        // Jam.reportOwnAdTap(): a click-through on a self-drawn ad ends it early.
        if (this.current?.own && this.current.id === p.id)
          this.finishAd(this.current.format === 'rewarded' ? 'completed' : 'shown');
        return;
    }
  }

  /**
   * Ends the ad on screen. The card's buttons call this: `completed` (sat through a
   * rewarded ad), `skipped` (closed early), `shown` (an interstitial ran out).
   */
  finishAd(result: AdResult): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    this.timers.clearTimeout(cur.timer);
    this.lastAdEnd = this.timers.now();
    this.hooks.adEnd(cur.id);
    const rewarded = cur.format === 'rewarded' && result === 'completed';
    if (cur.format === 'rewarded')
      this.adEvent(rewarded ? 'ad_rewarded_completed' : 'ad_rewarded_skipped');
    else if (result === 'skipped') this.adEvent('ad_interstitial_skipped');
    this.hooks.post('ad', {
      id: cur.id,
      phase: rewarded ? 'reward' : 'close',
      cooldownMs: AD_DEBOUNCE_MS,
    });
  }

  destroy(): void {
    if (this.current) this.timers.clearTimeout(this.current.timer);
    this.current = null;
    this.destroyed = true;
  }

  private requestAd(p: Record<string, unknown>): void {
    const id = typeof p.id === 'string' ? p.id : '';
    if (!id) return;
    const format: AdFormat = p.format === 'rewarded' ? 'rewarded' : 'interstitial';
    const sinceLast = this.timers.now() - this.lastAdEnd;
    if (this.current || sinceLast < AD_DEBOUNCE_MS) {
      this.adEvent('ad_not_ready');
      // Busy or inside the debounce: the refusal a real, unfilled SDK gives. A retry
      // time only where we know it — an ad on screen ends when the player closes it.
      this.hooks.post('ad', {
        id,
        phase: 'error',
        status: 'not_ready',
        ...(this.current ? {} : { retryAfterMs: Math.max(0, AD_DEBOUNCE_MS - sinceLast) }),
      });
      return;
    }
    const own = p.adUI === 'game';
    const durationMs = format === 'rewarded' ? AD_REWARDED_MS : AD_INTERSTITIAL_MS;
    // A self-drawn ad and an interstitial end by themselves; a rewarded card waits for
    // the player (claim / close), with the timer only as the net under a lost card.
    const autoEnd = own || format === 'interstitial';
    const timer = this.timers.setTimeout(
      () => this.finishAd(format === 'rewarded' ? 'completed' : 'shown'),
      autoEnd ? durationMs : durationMs + 60_000
    );
    this.current = { id, format, own, durationMs, timer };
    this.hooks.post('ad', { id, phase: 'open', durationMs });
    this.adEvent(own ? `ad_${format}_shown_own` : `ad_${format}_shown`);
    this.hooks.adShow({ id, format, own, durationMs });
  }

  // The ad funnel is the page's to record (jam: written by the portal, not the game).
  private adEvent(name: string): void {
    this.hooks.event?.(name, '', '');
  }

  private leaderboard(p: Record<string, unknown>): void {
    const id = typeof p.id === 'string' ? p.id.slice(0, 120) : '';
    if (!id) return;
    const op = p.op as LeaderboardOp;
    const board = typeof p.board === 'string' ? p.board : '';
    const args = p.args && typeof p.args === 'object' ? (p.args as Record<string, unknown>) : {};
    const reply = (ok: boolean, result: unknown, error?: string, status?: number) => {
      if (!this.destroyed) this.hooks.post('lb', { id, ok, result, error, status });
    };
    if (!LB_OPS.has(op) || !BOARD_RE.test(board)) {
      reply(false, null, 'bad request', 400);
      return;
    }
    if (!this.hooks.leaderboard) {
      reply(false, null, 'leaderboards are not available here yet', 503);
      return;
    }
    this.hooks.leaderboard(op, board, args).then(
      result => reply(true, result === undefined ? null : result),
      (err: unknown) =>
        reply(
          false,
          null,
          err instanceof Error ? err.message : 'failed',
          err instanceof LeaderboardError ? err.status : 0
        )
    );
  }

  private haptics(pattern: unknown): void {
    // Validated again here: the SDK is public code, the page is ours.
    const phases = Array.isArray(pattern) ? pattern : [pattern];
    if (
      phases.length === 0 ||
      phases.length > 100 ||
      phases.some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1000) ||
      (phases as number[]).reduce((sum, n) => sum + n, 0) > 10_000
    )
      return;
    this.hooks.vibrate?.(pattern as number | number[]);
  }
}
