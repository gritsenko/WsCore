import JamBridge, { type AdShow, type JamBridgeHooks } from './JamBridge';
import type { PortalGame } from '../network/ClientEvents';
import PlaySession, { type PlayEvent } from './PlaySession';

/** A held loading screen is dropped after this anyway (a build that died while loading). */
const SPLASH_MAX_HOLD_MS = 3 * 60 * 1000;
/** Without a hold, the loading screen fades this long after the frame's own load. */
const SPLASH_AFTER_LOAD_MS = 300;

/**
 * The URL the frame loads: the build's entry plus what the jam SDK reads from it —
 * `_jam_p` (the game id, `Jam.getGameId()`) and `_jam_o` (our origin; the SDK honours it
 * only if it is in the origins list our server put into its tag).
 */
export function frameUrl(playUrl: string, gameId: string, portalOrigin: string): string {
  const url = new URL(playUrl);
  url.searchParams.set('_jam_p', gameId);
  url.searchParams.set('_jam_o', portalOrigin);
  return url.href;
}

/**
 * Whether a message event comes from the game's frame: from its origin AND from its
 * window — the origin is shared by every game on the games origin, the window is what
 * identifies this one.
 */
export function isFromFrame(
  e: Pick<MessageEvent, 'origin' | 'source'>,
  frameWindow: unknown,
  frameOrigin: string
): boolean {
  return !!frameWindow && e.origin === frameOrigin && e.source === frameWindow;
}

export interface GameHostOptions {
  /** Leaderboards / events backends (later stages); absent = not available. */
  leaderboard?: JamBridgeHooks['leaderboard'];
  event?: JamBridgeHooks['event'];
  /** "Leave" was pressed. */
  onLeave(): void;
  /** "New version" was pressed: restart with the latest build. */
  onRestart?(): void;
  /** Phone layout: show / hide the room's chat next to the game. */
  onToggleChat?(): void;
  /** Where the play session's heartbeats and the game's events go (analytics). */
  play?: {
    sendBeat(activeMs: number, ended: boolean): void;
    sendEvents(events: PlayEvent[]): void;
  };
}

/**
 * The stage a game is played on: a toolbar, the game's iframe (on the games origin,
 * sandboxed) and what the page draws over it for the jam bridge — the loading screen
 * with the game's title, and the mock ad card. Owns the bridge and every listener;
 * `destroy()` leaves nothing behind.
 */
export default class GameHost {
  readonly element: HTMLDivElement;
  readonly game: PortalGame;
  private readonly frame: HTMLIFrameElement;
  private readonly frameOrigin: string;
  private readonly bridge: JamBridge;
  private readonly splash: HTMLDivElement;
  private readonly adLayer: HTMLDivElement;
  private readonly updateButton: HTMLButtonElement;
  private splashHeld = false;
  private splashTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private session: PlaySession | null = null;

  constructor(game: PortalGame, options: GameHostOptions) {
    this.game = game;
    this.frameOrigin = new URL(game.playUrl).origin;

    this.element = document.createElement('div');
    this.element.className = 'portal-stage';

    const bar = div('portal-stage-bar');
    const leave = button('portal-stage-btn portal-stage-leave', '←', 'Выйти из игры');
    leave.onclick = () => options.onLeave();
    bar.appendChild(leave);
    const title = div('portal-stage-title');
    title.textContent = game.title;
    bar.appendChild(title);
    if (game.version) {
      const version = div('portal-stage-version');
      version.textContent = game.version;
      bar.appendChild(version);
    }
    const spacer = div('portal-stage-spacer');
    bar.appendChild(spacer);
    this.updateButton = button(
      'portal-stage-btn portal-stage-update',
      'Новая версия',
      'Перезапустить с новой версией'
    );
    this.updateButton.hidden = true;
    this.updateButton.onclick = () => (options.onRestart ?? options.onLeave)();
    bar.appendChild(this.updateButton);
    if (options.onToggleChat) {
      const chat = button('portal-stage-btn portal-stage-chat', 'Чат', 'Чат комнаты');
      chat.onclick = () => options.onToggleChat?.();
      bar.appendChild(chat);
    }
    const full = button('portal-stage-btn', '', 'Во весь экран');
    // An SVG: the ⛶ glyph is missing from common system fonts.
    full.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
    full.onclick = () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void this.element.requestFullscreen?.().catch(() => {});
    };
    bar.appendChild(full);
    this.element.appendChild(bar);

    const wrap = div('portal-stage-frame');
    this.frame = document.createElement('iframe');
    this.frame.title = game.title;
    // Another origin, so allow-same-origin gives the game its own origin (engine builds
    // need it for their assets and storage) — never ours.
    this.frame.setAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms allow-modals'
    );
    this.frame.allow = 'fullscreen; gamepad; autoplay; clipboard-write';
    this.frame.referrerPolicy = 'origin';
    this.frame.addEventListener('load', this.onFrameLoad);
    this.frame.src = frameUrl(game.playUrl, game.id, location.origin);
    wrap.appendChild(this.frame);

    this.splash = div('portal-splash');
    const splashTitle = div('portal-splash-title');
    splashTitle.textContent = game.title;
    this.splash.appendChild(splashTitle);
    this.splash.appendChild(div('portal-splash-spinner'));
    // A tap dismisses it: when a build fails to boot, the evidence is underneath.
    this.splash.onclick = () => this.hideSplash();
    wrap.appendChild(this.splash);

    this.adLayer = div('portal-ad');
    this.adLayer.hidden = true;
    wrap.appendChild(this.adLayer);
    this.element.appendChild(wrap);

    this.bridge = new JamBridge({
      post: (type, payload) => this.post(type, payload),
      splash: state => (state === 'hold' ? this.holdSplash() : this.hideSplash()),
      adShow: show => this.showAd(show),
      adEnd: () => this.hideAd(),
      leaderboard: options.leaderboard,
      event: (name, level, params) => {
        this.session?.event(name, level, params);
        options.event?.(name, level, params);
      },
      vibrate: pattern => {
        if (document.visibilityState === 'visible' && !this.bridge.adShowing)
          navigator.vibrate?.(pattern);
      },
      log: (kind, text) => console.debug(`[game ${game.slug}] ${kind}: ${text}`),
    });
    window.addEventListener('message', this.onMessage);

    // The play session: attention time (visible, focused, no mock ad) → heartbeats.
    if (options.play) {
      const play = options.play;
      this.session = new PlaySession({
        now: () => Date.now(),
        setInterval: (fn, ms) => setInterval(fn, ms),
        clearInterval: h => clearInterval(h as ReturnType<typeof setInterval>),
        engaged: () =>
          document.visibilityState === 'visible' && document.hasFocus() && !this.bridge.adShowing,
        sendBeat: (ms, ended) => play.sendBeat(ms, ended),
        sendEvents: events => play.sendEvents(events),
      });
      this.session.start();
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pagehide', this.onPageHide);
    }
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.session?.hidden();
  };

  private readonly onPageHide = (): void => this.session?.stop();

  /** A newer build of this game is out: offer a restart. */
  setUpdateAvailable(available: boolean): void {
    this.updateButton.hidden = !available;
  }

  destroy(): void {
    this.session?.stop();
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('message', this.onMessage);
    this.frame.removeEventListener('load', this.onFrameLoad);
    this.bridge.destroy();
    if (this.splashTimer) clearTimeout(this.splashTimer);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.frame.src = 'about:blank';
    this.element.remove();
  }

  private readonly onMessage = (e: MessageEvent): void => {
    if (!isFromFrame(e, this.frame.contentWindow, this.frameOrigin)) return;
    this.bridge.receive(e.data);
  };

  private post(type: string, payload: Record<string, unknown>): void {
    try {
      this.frame.contentWindow?.postMessage(
        { source: 'jam-host', v: 1, type, payload },
        this.frameOrigin
      );
    } catch {
      /* the frame went away mid-message */
    }
  }

  // ---- loading screen -------------------------------------------------------------------

  private readonly onFrameLoad = (): void => {
    // The page's own load: fade unless the game asked to hold it (Jam.gameLoading()).
    if (!this.splashHeld) this.later(() => this.hideSplash(), SPLASH_AFTER_LOAD_MS);
  };

  private holdSplash(): void {
    if (this.splash.hidden) return; // too late — a screen that comes back reads as broken
    this.splashHeld = true;
    if (this.splashTimer) clearTimeout(this.splashTimer);
    this.splashTimer = setTimeout(() => this.hideSplash(), SPLASH_MAX_HOLD_MS);
  }

  private hideSplash(): void {
    this.splashHeld = false;
    this.splash.hidden = true;
    if (this.splashTimer) clearTimeout(this.splashTimer);
    this.splashTimer = null;
  }

  // ---- mock ad --------------------------------------------------------------------------

  private showAd(show: AdShow): void {
    if (show.own) return; // the game draws it
    this.adLayer.replaceChildren();
    const card = div('portal-ad-card');
    const label = div('portal-ad-label');
    label.textContent = show.format === 'rewarded' ? 'Реклама за награду' : 'Реклама';
    card.appendChild(label);
    const body = div('portal-ad-body');
    body.textContent = 'Здесь могла быть ваша реклама';
    card.appendChild(body);
    const count = div('portal-ad-count');
    card.appendChild(count);
    const actions = div('portal-ad-actions');
    const close = button('portal-ad-btn', 'Закрыть', 'Закрыть рекламу');
    close.onclick = () => this.bridge.finishAd(show.format === 'rewarded' ? 'skipped' : 'shown');
    actions.appendChild(close);
    let claim: HTMLButtonElement | null = null;
    if (show.format === 'rewarded') {
      claim = button('portal-ad-btn portal-ad-claim', 'Получить награду', 'Получить награду');
      claim.disabled = true;
      claim.onclick = () => this.bridge.finishAd('completed');
      actions.appendChild(claim);
    }
    card.appendChild(actions);
    this.adLayer.appendChild(card);
    this.adLayer.hidden = false;

    const endsAt = Date.now() + show.durationMs;
    const tick = () => {
      if (this.adLayer.hidden) return;
      const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      count.textContent = left > 0 ? `${left}…` : '';
      if (left > 0) this.later(tick, 250);
      else if (claim) claim.disabled = false;
    };
    tick();
  }

  private hideAd(): void {
    this.adLayer.hidden = true;
    this.adLayer.replaceChildren();
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
  }
}

function div(className: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  return el;
}

function button(className: string, text: string, title: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.textContent = text;
  el.title = title;
  el.setAttribute('aria-label', title);
  return el;
}
