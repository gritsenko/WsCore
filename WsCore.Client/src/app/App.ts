import WsClient from '../network/WsClient';
import { ConnectionStatus } from '../network/WsConnection';
import Player from '../game/Player';
import LobbyState from './LobbyState';
import GameScene from '../game/GameScene';

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
  private banner: HTMLDivElement;

  constructor(url: string) {
    this.url = url;
    this.client = new WsClient<Player>();
    this.client.playerFactory = (id: number) => new Player(id);

    this.banner = this.createBanner();

    // A fresh InitPlayerEvent (first connect OR reconnect) → the active state
    // rejoins its room under the new clientId and rebuilds from server events.
    this.client.on('sessionInit', () => this.activeState?.onSessionInit());
    this.client.on('connectionStatus', (status: ConnectionStatus) => this.onStatus(status));
  }

  setPlayerName(name: string): void {
    this.client.myPlayerName = name;
  }

  start(): void {
    this.enterLobby();
    this.client.connect(this.url);
  }

  private enterLobby(): void {
    this.transitionTo(new LobbyState(this.client, () => this.enterGame()));
  }

  private enterGame(): void {
    this.transitionTo(new GameScene(this.client, () => this.enterLobby()));
  }

  private transitionTo(state: AppState): void {
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
