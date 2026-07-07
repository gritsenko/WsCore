import WsConnection, { ConnectionStatus } from './WsConnection';
import { Unsubscribe } from '../utils/Emitter';
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
import { RoomManager } from './rooms/RoomManager.js';
import { CommunicationMode } from './rooms/CommunicationMode.js';
import { RoomListEvent } from './protocol/RoomListEvent';
import { RoomUsersUpdateEvent } from './protocol/RoomUsersUpdateEvent';

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

export default class WsClient<T extends IPlayer = IPlayer> extends WsConnection {
  static MapObjectData = MapObjectData;

  constructor() {
    super();
    this.roomManager = new RoomManager();
    this.initializeDefaultRooms();
  }

  private initializeDefaultRooms(): void {
    // Create default rooms - mark them as persistent so they don't get deleted when empty.
    // Must mirror the server's GameServer.InitializeDefaultRooms: lobby / voice / game.
    this.roomManager.createRoom('lobby', 'Lobby', [CommunicationMode.TextChat], true);
    this.roomManager.createRoom(
      'voice',
      'Voice Room',
      [CommunicationMode.VoiceChat, CommunicationMode.TextChat],
      true
    );
    this.roomManager.createRoom(
      'game',
      'Game Room',
      [CommunicationMode.Spatial, CommunicationMode.TextChat],
      true
    );
  }

  /**
   * Subscribe to a client event. Returns an unsubscribe handle so lobby/game
   * states can detach on teardown instead of the client being recreated.
   */
  on(event: 'connectionStatus', fn: (status: ConnectionStatus) => void): Unsubscribe;
  on(event: 'sessionInit', fn: () => void): Unsubscribe;
  on(event: 'playerCreate' | 'playerRemove' | 'playerJoined', fn: (player: T) => void): Unsubscribe;
  on(event: 'playerName', fn: (id: number, name: string) => void): Unsubscribe;
  on(event: 'roomUsers', fn: (msg: RoomUsersUpdateEvent) => void): Unsubscribe;
  on(event: 'mapObjects', fn: (objects: (MapObjectData | null)[] | null) => void): Unsubscribe;
  on(event: 'chat', fn: (name: string, text: string, isOwn: boolean) => void): Unsubscribe;
  on(event: string, fn: (...args: any[]) => void): Unsubscribe {
    return super.on(event, fn);
  }

  myPlayer: T | null = null;
  myPlayerName = 'John Smith';
  playersCount = 0;
  players: { [id: number]: T } = {};
  playerNames: { [id: number]: string } = {}; // Cache player names
  playerFactory?: (id: number) => T;
  roomManager: RoomManager;

  // Room-aware properties
  currentCommunicationMode: CommunicationMode = CommunicationMode.TextChat;
  isInSpatialRoom: boolean = false;

  override onInitPlayerEvent(msg: InitPlayerEvent): void {
    // Every InitPlayerEvent (first connect OR reconnect) starts a fresh session:
    // the server assigns a new clientId and knows nothing about the previous one.
    this.resetSession();

    this.clientId = msg.clientId;
    console.log('Player initialized', this.clientId);
    this.sendSetPlayerNameRequest(this.myPlayerName);
    this.sendUpdatePlayerSlotsRequest(0, 0, 0);

    // Room choice is driven by the active state (lobby vs game) via sessionInit,
    // so a reconnect while in-game rejoins the game room, not the lobby.
    this.emitter.emit('sessionInit');
  }

  override onSetPlayerNameEvent(msg: SetPlayerNameEvent): void {
    const clientId = msg.clientId;
    const playerName = msg.name || '';
    // Cache the player name
    this.playerNames[clientId] = playerName;
    if (this.players[clientId] != null) {
      this.players[clientId].updateName(playerName);
    }
    this.emitter.emit('playerName', clientId, playerName);
  }

  override onChatMessageEvent(msg: ChatMessageEvent): void {
    const id = msg.clientId;
    this.emitter.emit('chat', this.resolveName(id), msg.message || '', id === this.clientId);
  }

  override onPlayerJoinedEvent(msg: PlayerJoinedEvent): void {
    if (msg.playerStateData) {
      this.updatePlayer(msg.playerStateData);
      const player = this.players[msg.playerStateData.id];
      if (player) this.emitter.emit('playerJoined', player);
    }
  }

  override onPlayerLeftEvent(msg: PlayerLeftEvent): void {
    // Leave room if this was our player
    if (msg.clientId === this.clientId) {
      this.roomManager.leaveRoom(this.clientId);
    }
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
    // Only process spatial updates if we're in a spatial room
    if (!this.roomManager.shouldReceiveSpatialUpdates(this.clientId)) {
      return; // Ignore spatial updates in non-spatial rooms
    }

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
    this.emitter.emit('mapObjects', msg.mapObjects);
  }

  override onRoomListEvent(msg: RoomListEvent): void {
    console.log('Room list received:', msg.rooms);

    if (msg.rooms) {
      // Update room user counts
      for (const room of msg.rooms) {
        this.roomManager.updateRoomUserCount(room.id, room.userCount);
      }
    }
  }

  override onRoomUsersUpdateEvent(msg: RoomUsersUpdateEvent): void {
    console.log(`Room users update for ${msg.roomId}:`, msg.users);

    if (msg.roomId && msg.users) {
      const room = this.roomManager.getRoom(msg.roomId);
      if (room) {
        // Clear existing clients and rebuild from update
        room.clients.clear();
        for (const userInfo of msg.users) {
          if (userInfo) {
            room.addClient(userInfo.clientId, userInfo.name || '');
          }
        }
      }
    }

    this.emitter.emit('roomUsers', msg);
  }

  /**
   * Resolve a display name for a client id, preferring our own name, then the
   * name cache, then the player object. Used for chat labelling.
   */
  private resolveName(id: number): string {
    if (this.myPlayer && id === this.myPlayer.id) return this.myPlayerName;
    if (this.playerNames[id]) return this.playerNames[id];
    const player = this.players[id];
    if (player?.name && player.name.length > 0) return player.name;
    return `Player ${id}`;
  }

  removePlayer(clientId: number): void {
    const player = this.players[clientId];
    if (!player) return;

    delete this.players[clientId];
    this.playersCount--;
    if (this.myPlayer === player) this.myPlayer = null;
    this.emitter.emit('playerRemove', player);

    player.destroy();
  }

  /**
   * Tear down all per-session state so a reconnect (with a new clientId) rebuilds
   * cleanly. removePlayer() per entry so subscribers (e.g. the game scene) dispose
   * their visuals — a bare `players = {}` would silently leak them.
   */
  resetSession(): void {
    for (const id of Object.keys(this.players)) {
      this.removePlayer(Number(id));
    }
    this.playersCount = 0;
    this.myPlayer = null;
    this.playerNames = {};
    // Keep persistent room definitions; only drop membership. clearAll() would
    // delete lobby/voice/game and subsequent joinRoom would silently fail.
    this.roomManager.resetClients();
    this.isInSpatialRoom = false;
    this.currentCommunicationMode = CommunicationMode.TextChat;
  }

  updatePlayer(playerData: PlayerStateData): void {
    let player: T | null = null;
    let isNewPlayer = false;
    const playerId = playerData.id;

    if (playerId in this.players) {
      player = this.players[playerId];
    } else {
      if (!this.playerFactory) {
        console.error('WsClient: playerFactory not set, cannot create player', playerId);
        return;
      }
      player = this.playerFactory(playerId);
      this.players[playerId] = player;
      isNewPlayer = true;
      this.playersCount++;
    }

    this.setPlayerData(player, playerData);

    if (!this.myPlayer && player.id === this.clientId) {
      console.log('my player:', player);
      this.myPlayer = player;
    }

    if (isNewPlayer) {
      this.emitter.emit('playerCreate', player);
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

  /**
   * Room management methods
   */

  /**
   * Join a room
   */
  joinRoom(roomId: string, playerName?: string): boolean {
    const name = playerName || this.myPlayerName;
    const success = this.roomManager.joinRoom(this.clientId, name, roomId);

    if (success) {
      const room = this.roomManager.getRoom(roomId);
      if (room) {
        this.isInSpatialRoom = room.supportsMode(CommunicationMode.Spatial);

        // Activate the spatial mode so shouldReceiveSpatialUpdates() returns true and
        // GameTickUpdateEvent movement is applied. Without this the client stays in the
        // default TextChat mode and silently drops every tick (audit §4.1).
        if (room.supportsMode(CommunicationMode.Spatial)) {
          this.setCommunicationMode(CommunicationMode.Spatial);
        }
      }

      // Send join room request to server
      this.sendJoinRoomRequest(roomId);
    }

    return success;
  }

  /**
   * Leave current room
   */
  leaveRoom(): boolean {
    const success = this.roomManager.leaveRoom(this.clientId);
    if (success) {
      this.isInSpatialRoom = false;
    }
    return success;
  }

  /**
   * Switch communication mode within current room
   */
  setCommunicationMode(mode: CommunicationMode): boolean {
    const success = this.roomManager.setClientMode(this.clientId, mode);
    if (success) {
      this.currentCommunicationMode = mode;
    }
    return success;
  }

  /**
   * Get current room info
   */
  getCurrentRoom() {
    return this.roomManager.getClientRoom(this.clientId);
  }

  /**
   * Check if should receive spatial updates
   */
  shouldReceiveSpatialUpdates(): boolean {
    return this.roomManager.shouldReceiveSpatialUpdates(this.clientId);
  }
}
