import WsClient from '../network/WsClient';
import { ConnectionStatus } from '../network/WsConnection';
import Player from '../game/Player';
import LobbyState from './LobbyState';
import IdleDetector from '../utils/IdleDetector';
// GameScene (and three.js with it) is imported dynamically in enterGame() — a
// static import here would pull three into the entry chunk.

/**
 * A lobby / game state of the unified client. Both share the one WsClient owned
 * by App and never create their own socket.
 */
interface AppState {
  enter(): void;
  /** Called once clientId is assigned (first connect, reconnect, or a switch). */
  onSessionInit(): void;
  exit(): void;
}

/**
 * The unified client shell. Creates ONE WsClient that lives the whole session,
 * connects once, and swaps between lobby and game states (never recreating the
 * client). Owns the connection banner and the reconnect re-init dispatch.
 */
export default class App {
  private readonly url: string;
  private readonly client: WsClient<Player>;
  private activeState: AppState | null = null;
  /** Bumped on every transition; an async game load started before it is stale. */
  private transitionSeq = 0;
  /** True while the lazily-loaded game chunk is being fetched. */
  private gameLoading = false;
  private banner: HTMLDivElement;
  /** Reports the user away (afk) after a while without input, in the lobby or in game. */
  private readonly idle: IdleDetector;

  constructor(url: string) {
    this.url = url;
    this.client = new WsClient<Player>();
    this.client.playerFactory = (id: number) => new Player(id);

    this.banner = this.createBanner();
    this.idle = new IdleDetector(document, away => this.client.setAway(away));

    // A fresh InitPlayerEvent (first connect OR reconnect) → the active state
    // rejoins its room under the new clientId and rebuilds from server events.
    this.client.on('sessionInit', () => this.activeState?.onSessionInit());
    this.client.on('connectionStatus', (status: ConnectionStatus) => this.onStatus(status));
  }

  setPlayerName(name: string): void {
    this.client.myPlayerName = name;
  }

  /** The stable identity sent on every (re)connect; see WsClient.userKey. */
  setUserKey(userKey: string): void {
    this.client.userKey = userKey;
  }

  start(): void {
    this.idle.start();
    this.enterLobby();
    this.client.connect(this.url);
  }

  private enterLobby(): void {
    this.transitionTo(new LobbyState(this.client, roomId => this.enterGame(roomId)));
  }

  /**
   * Lazy-loads the game chunk (three.js + the scene) on the first Play, so the
   * lobby never downloads it. The lobby stays fully active while the chunk loads:
   * chat, room switches, disconnects and reconnect `sessionInit`s all keep going to
   * it. Once loaded, the scene is created only if nothing else happened meanwhile —
   * a repeated Play click reuses the in-flight load, and any transition in the gap
   * (bumping `transitionSeq`) makes the late result a no-op, so a scene is never
   * created twice nor after the user has moved on.
   */
  private enterGame(roomId: string): void {
    if (this.gameLoading) return; // Play clicked again while the chunk is still loading.
    this.gameLoading = true;
    const seq = this.transitionSeq;

    import('../game/GameScene')
      .then(({ default: GameScene }) => {
        if (seq !== this.transitionSeq) return; // Moved on while loading.
        this.transitionTo(new GameScene(this.client, roomId, () => this.enterLobby()));
      })
      .catch(err => {
        // Chunk fetch failed (offline / redeploy removed the old hash). Stay in the
        // lobby; Play can be retried.
        console.error('App: failed to load the game scene', err);
      })
      .finally(() => {
        this.gameLoading = false;
      });
  }

  private transitionTo(state: AppState): void {
    this.transitionSeq++;
    // Old state tears down its own DOM/scene/subscriptions before the new one builds.
    this.activeState?.exit();
    this.activeState = state;
    state.enter();
    // Already connected (lobby↔game switch): run the session init immediately.
    // On first load / reconnect it fires from the sessionInit event instead.
    if (this.client.clientId >= 0) {
      state.onSessionInit();
    }
  }

  // ==================== connection banner ====================

  private onStatus(status: ConnectionStatus): void {
    switch (status) {
      case 'open':
      case 'closed':
        this.banner.style.display = 'none';
        break;
      case 'connecting':
        this.showBanner('Connecting…');
        break;
      case 'reconnecting':
        this.showBanner('Connection lost — reconnecting…');
        break;
    }
  }

  private showBanner(text: string): void {
    this.banner.textContent = text;
    this.banner.style.display = 'block';
  }

  private createBanner(): HTMLDivElement {
    const banner = document.createElement('div');
    banner.id = 'connection-banner';
    banner.style.position = 'fixed';
    banner.style.top = '0';
    banner.style.left = '0';
    banner.style.right = '0';
    banner.style.zIndex = '20000';
    banner.style.padding = '8px 16px';
    banner.style.textAlign = 'center';
    banner.style.background = 'rgba(180, 60, 60, 0.95)';
    banner.style.color = 'white';
    banner.style.fontFamily = 'Arial, sans-serif';
    banner.style.fontSize = '13px';
    banner.style.fontWeight = '600';
    banner.style.display = 'none';
    banner.style.pointerEvents = 'none';
    document.body.appendChild(banner);
    return banner;
  }
}
