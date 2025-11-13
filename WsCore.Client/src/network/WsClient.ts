import Player from '../2d/Player';
import WsConnection from './WsConnection';
import { InitPlayerEvent } from './protocol/InitPlayerEvent';
import { PlayerJoinedEvent } from './protocol/PlayerJoinedEvent';
import { PlayerLeftEvent } from './protocol/PlayerLeftEvent';
import { GameStateUpdateEvent } from './protocol/GameStateUpdateEvent';
import { GameTickUpdateEvent } from './protocol/GameTickUpdateEvent';
import { SetPlayerNameEvent } from './protocol/SetPlayerNameEvent';
import { ChatMessageEvent } from './protocol/ChatMessageEvent';
import { UpdateMapObjectsEvent } from './protocol/UpdateMapObjectsEvent';
import { PlayerStateData } from './protocol/PlayerStateData';
import { MapObjectData } from './protocol/MapObjectData';

export interface IPlayer {
  id: number;
  x: number;
  y: number;
  ax: number;
  ay: number;
  targetX: number;
  targetY: number;
  angle: number;
  controls: number;
  name: string;
  speed: { x: number; y: number };
  animationState: number;
  hp: number;
  maxHp: number;
  body: number;
  weapon: number;
  armor: number;
  isMyPlayer: boolean;

  updateName(name: string): void;
  onStateUpdatedFromServer(): void;
  destroy(): void;
}

export default class WsClient<T extends IPlayer = Player> extends WsConnection {
  static MapObjectData = MapObjectData;

  myPlayer: T | null = null;
  myPlayerName = 'John Smith';
  playersCount = 0;
  players: { [id: number]: T } = {};
  playerNames: { [id: number]: string } = {}; // Cache player names
  playerFactory?: (id: number) => T;

  onPlayerCreateCallback?: (player: T) => void;
  onGameInitCallback?: () => void;
  onMapObjectsCallback?: (objects: (MapObjectData | null)[] | null) => void;
  onPlayerRemovedCallback?: (player: T) => void;

  override onInitPlayerEvent(msg: InitPlayerEvent): void {
    this.clientId = msg.clientId;
    console.log('Player initialized', this.clientId);
    this.sendSetPlayerNameRequest(this.myPlayerName);
    this.sendUpdatePlayerSlotsRequest(0, 0, 0);

    this.onGameInitCallback?.();
  }

  override onSetPlayerNameEvent(msg: SetPlayerNameEvent): void {
    const clientId = msg.clientId;
    const playerName = msg.name || '';
    // Cache the player name
    this.playerNames[clientId] = playerName;
    if (this.players[clientId] != null) {
      this.players[clientId].updateName(playerName);
    }
  }

  override onChatMessageEvent(msg: ChatMessageEvent): void {
    this.writeToChat(msg.clientId, msg.message || '');
  }

  override onPlayerJoinedEvent(msg: PlayerJoinedEvent): void {
    if (msg.playerStateData) {
      this.updatePlayer(msg.playerStateData);
    }
  }

  override onPlayerLeftEvent(msg: PlayerLeftEvent): void {
    this.removePlayer(msg.clientId);
  }

  override onGameStateUpdateEvent(msg: GameStateUpdateEvent): void {
    if (!msg.playerStateData) return;

    const playersCount = msg.playerStateData.length;
    for (let i = 0; i < playersCount; i++) {
      const playerData = msg.playerStateData[i];
      if (playerData) {
        this.updatePlayer(playerData);
      }
    }
  }

  override onGameTickUpdateEvent(msg: GameTickUpdateEvent): void {
    if (!msg.movementStates) return;

    const playersCount = msg.movementStates.length;

    for (let i = 0; i < playersCount; i++) {
      const state = msg.movementStates[i];
      if (!state) continue;

      const playerId = state.playerId;
      const p = this.players[playerId];

      if (p != undefined) {
        p.x = state.x;
        p.y = state.y;
        p.ax = state.aimX;
        p.ay = state.aimY;
        p.targetX = state.targetX;
        p.targetY = state.targetY;
        p.angle = state.bodyAngle;
        p.controls = state.controlsState;
        p.speed.x = state.velocityX;
        p.speed.y = state.velocityY;
        p.animationState = state.animationState;
        p.onStateUpdatedFromServer();
      }
    }
  }

  override onUpdateMapObjectsEvent(msg: UpdateMapObjectsEvent): void {
    this.onMapObjectsCallback?.(msg.mapObjects);
  }

  writeToChat(id: number, message: string): void {
    console.log(`Message to chat from client ${id}: ${message}`);
  }

  removePlayer(clientId: number): void {
    const player = this.players[clientId];
    if (!player) return;

    delete this.players[clientId];
    this.playersCount--;
    this.onPlayerRemovedCallback?.(player);

    player.destroy();
  }

  updatePlayer(playerData: PlayerStateData): void {
    let player: T | null = null;
    let isNewPlayer = false;
    const playerId = playerData.id;

    if (playerId in this.players) {
      player = this.players[playerId];
    } else {
      // Use factory function if provided, otherwise create default Player
      if (this.playerFactory) {
        player = this.playerFactory(playerId);
      } else {
        player = new Player(playerId) as unknown as T;
      }
      this.players[playerId] = player;
      isNewPlayer = true;
      this.playersCount++;
    }

    this.setPlayerData(player, playerData);

    if (!this.myPlayer && player.id === this.clientId) {
      console.log('my player:', player);
      this.myPlayer = player;
    }

    if (isNewPlayer && this.onPlayerCreateCallback != null) {
      this.onPlayerCreateCallback(player);
    }
  }

  setPlayerData(p: T, pd: PlayerStateData): void {
    p.name = (pd.name || '').trim();
    p.hp = pd.hp;
    p.maxHp = pd.maxHp;
    p.body = pd.bodyIndex;
    p.weapon = pd.weaponIndex;
    p.armor = pd.armorIndex;

    const ms = pd.movementState;
    if (ms) {
      p.x = ms.x;
      p.y = ms.y;
      p.ax = ms.aimX;
      p.ay = ms.aimY;
      p.angle = ms.bodyAngle;
      p.controls = ms.controlsState;
      p.speed.x = ms.velocityX;
      p.speed.y = ms.velocityY;
    }
  }
}
