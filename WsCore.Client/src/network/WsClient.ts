import WsConnection from './WsConnection';
import type { IPlayer } from './ClientEvents';
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
import { RoomInfo } from './protocol/RoomInfo';
import { RoomDescription, RoomManager } from './rooms/RoomManager.js';
import { CommunicationMode, parseServerModes } from './rooms/CommunicationMode.js';
import { RoomListEvent } from './protocol/RoomListEvent';
import { RoomUsersUpdateEvent } from './protocol/RoomUsersUpdateEvent';
import { JoinRoomResultEvent } from './protocol/JoinRoomResultEvent';
import { ServerClock } from '../utils/SnapshotInterpolation';

export type { IPlayer } from './ClientEvents';

function describeRoom(info: RoomInfo): RoomDescription | null {
  if (!info.id) return null;
  return {
    id: info.id,
    name: info.name || info.id,
    supportedModes: parseServerModes(info.supportedModes),
    isPersistent: info.isPersistent,
    userCount: info.userCount,
  };
}

/**
 * Session state on top of the transport. A connection is not a player: in the lobby
 * there are no `players` at all; they exist only while we are in a spatial room (the
 * server sends GameStateUpdate/PlayerJoined/PlayerLeft only to spatial-room members).
 * Rooms come from the server (RoomListEvent) and membership changes only when the
 * server confirms it (JoinRoomResultEvent).
 */
export default class WsClient<T extends IPlayer = IPlayer> extends WsConnection<T> {
  static MapObjectData = MapObjectData;

  myPlayer: T | null = null;
  myPlayerName = 'John Smith';
  playersCount = 0;
  players: { [id: number]: T } = {};
  playerNames: { [id: number]: string } = {}; // Cache player names
  playerFactory?: (id: number) => T;
  readonly roomManager = new RoomManager();
  /** Server-time estimate from tick snapshot stamps; drives snapshot interpolation. */
  readonly serverClock = new ServerClock();
  /** Local clock (ms) used to timestamp snapshot arrivals; replaceable in tests. */
  now: () => number = () => performance.now();
  private readonly tickIncluded = new Set<number>();

  // Room-aware properties
  currentCommunicationMode: CommunicationMode = CommunicationMode.TextChat;
  isInSpatialRoom: boolean = false;
  /** Room of the latest JoinRoomRequest still awaiting the server's answer. */
  pendingRoomId: string | null = null;
  /**
   * The room the server places every new connection in (the first confirmed join of a
   * session — the server's automatic lobby join). Where the lobby state returns to.
   */
  homeRoomId: string | null = null;
  private awaitingHomeRoom = false;

  override onInitPlayerEvent(msg: InitPlayerEvent): void {
    // Every InitPlayerEvent (first connect OR reconnect) starts a fresh session:
    // the server assigns a new clientId and knows nothing about the previous one.
    this.resetSession();

    this.clientId = msg.clientId;
    this.awaitingHomeRoom = true;
    console.log('Player initialized', this.clientId);
    // Session identity (kept server-side even without an avatar) and the room list.
    this.sendSetPlayerNameRequest(this.myPlayerName);
    this.sendUpdatePlayerSlotsRequest(0, 0, 0);
    this.requestRoomList();

    // Room choice is driven by the active state (lobby vs game) via sessionInit,
    // so a reconnect while in-game rejoins the game room, not the lobby.
    this.emitter.emit('sessionInit');
  }

  override onSetPlayerNameEvent(msg: SetPlayerNameEvent): void {
    const clientId = msg.clientId;
    const playerName = msg.name || '';
    // Cache the player name
    this.playerNames[clientId] = playerName;
    if (clientId === this.clientId && playerName) this.myPlayerName = playerName;
    const roomClient = this.getCurrentRoom()?.getClient(clientId);
    if (roomClient) roomClient.name = playerName;
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
    // A tick still in flight when we left the spatial room: ignore it.
    if (!this.isInSpatialRoom || !this.shouldReceiveSpatialUpdates()) return;

    // Snapshots are deltas: they carry only avatars that changed recently (plus every
    // avatar in a periodic full snapshot). An avatar missing from one is unchanged —
    // record that it is still where it was, never extrapolate it.
    const t = msg.serverTimeMs;
    this.serverClock.observe(t, this.now());

    const included = this.tickIncluded;
    included.clear();
    for (const state of msg.movementStates ?? []) {
      if (!state) continue;
      const p = this.players[state.playerId];
      if (p == undefined) continue;
      p.x = state.x;
      p.y = state.y;
      p.animationState = state.animationState;
      p.motion.push(t, state.x, state.y);
      p.onStateUpdatedFromServer();
      included.add(state.playerId);
    }

    for (const id in this.players) {
      if (!included.has(Number(id))) this.players[id].motion.hold(t);
    }
  }

  override onUpdateMapObjectsEvent(msg: UpdateMapObjectsEvent): void {
    this.emitter.emit('mapObjects', msg.mapObjects);
  }

  override onRoomListEvent(msg: RoomListEvent): void {
    const list: RoomDescription[] = [];
    for (const info of msg.rooms ?? []) {
      const desc = info && describeRoom(info);
      if (desc) list.push(desc);
    }
    this.roomManager.syncRooms(list);
    this.emitter.emit('roomList', this.roomManager.getAllRooms());
  }

  override onJoinRoomResultEvent(msg: JoinRoomResultEvent): void {
    const roomId = msg.roomId || '';
    if (this.pendingRoomId === roomId) this.pendingRoomId = null;

    if (!msg.success) {
      console.warn(`Join room "${roomId}" refused: ${msg.error}`);
      this.emitter.emit('roomJoinFailed', roomId, msg.error || 'Join failed');
      return;
    }

    // The result describes the room, so membership works even if it arrives before
    // (or without) a room list.
    const desc = msg.room && describeRoom(msg.room);
    if (desc) this.roomManager.upsertRoom(desc);

    const wasSpatial = this.isInSpatialRoom;
    this.roomManager.joinRoom(this.clientId, this.myPlayerName, roomId);
    const room = this.roomManager.getRoom(roomId);
    this.isInSpatialRoom = room?.supportsMode(CommunicationMode.Spatial) ?? false;

    if (this.isInSpatialRoom) {
      // Activate the spatial mode so GameTickUpdateEvent movement is applied (the
      // server does the same for spatial-room members).
      this.setCommunicationMode(CommunicationMode.Spatial);
    } else {
      this.currentCommunicationMode = CommunicationMode.TextChat;
    }

    // Players exist only inside the game world. Unless we stay in it, drop them all:
    // leaving → the world is gone for us; entering → the GameStateUpdateEvent that
    // follows this result rebuilds it from scratch (no stale players/duplicate views).
    if (!wasSpatial || !this.isInSpatialRoom) this.clearPlayers();

    if (this.awaitingHomeRoom) {
      this.homeRoomId = roomId;
      this.awaitingHomeRoom = false;
    }

    this.emitter.emit('roomJoined', roomId);
  }

  override onRoomUsersUpdateEvent(msg: RoomUsersUpdateEvent): void {
    if (msg.roomId && msg.users) {
      const room = this.roomManager.getRoom(msg.roomId);
      if (room) {
        // The server's user list carries no communication-mode info, so a naive
        // clear+rebuild would silently reset every client (including us) back to
        // the TextChat default — killing spatial updates (WASD/click-move) the
        // moment any room-membership broadcast arrives. Preserve modes across it.
        const previousModes = new Map(
          Array.from(room.clients.values(), c => [c.id, c.currentMode] as const)
        );
        room.clients.clear();
        for (const userInfo of msg.users) {
          if (userInfo) {
            room.addClient(
              userInfo.clientId,
              userInfo.name || '',
              previousModes.get(userInfo.clientId)
            );
            if (userInfo.name) this.playerNames[userInfo.clientId] = userInfo.name;
          }
        }
        room.userCount = room.clients.size;
      }
    }

    this.emitter.emit('roomUsers', msg);
  }

  /**
   * Resolve a display name for a client id, preferring our own name, then the
   * current room's user list, then the name cache, then the player object.
   */
  private resolveName(id: number): string {
    if (id === this.clientId) return this.myPlayerName;
    const roomName = this.getCurrentRoom()?.getClient(id)?.name;
    if (roomName) return roomName;
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
   * Remove every player via removePlayer() so subscribers (e.g. the game scene)
   * dispose their visuals — a bare `players = {}` would silently leak them.
   */
  clearPlayers(): void {
    for (const id of Object.keys(this.players)) {
      this.removePlayer(Number(id));
    }
    this.playersCount = 0;
    this.myPlayer = null;
  }

  /**
   * Tear down all per-session state so a reconnect (with a new clientId) rebuilds
   * cleanly.
   */
  resetSession(): void {
    this.clearPlayers();
    this.playerNames = {};
    // Keep the room definitions (the next RoomListEvent replaces them); only drop
    // membership — the new session starts in no room until the server confirms one.
    this.roomManager.resetClients();
    this.serverClock.reset(); // a new session may be a restarted server (new time base)
    this.isInSpatialRoom = false;
    this.currentCommunicationMode = CommunicationMode.TextChat;
    this.pendingRoomId = null;
    this.homeRoomId = null; // re-learnt from the new session's automatic join
    this.awaitingHomeRoom = false;
  }

  updatePlayer(playerData: PlayerStateData): void {
    let player: T;
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
      p.animationState = ms.animationState;
      // Full state, but untimed: start the interpolation history over from here.
      p.motion.reset(ms.x, ms.y);
    }
  }

  /**
   * Room management methods
   */

  /** Ask the server for the room list; the answer arrives as the `roomList` event. */
  requestRoomList(): void {
    this.sendGetRoomListRequest();
  }

  /**
   * Ask the server to move us into `roomId`. Nothing changes locally until the server
   * answers: `roomJoined` on success (membership, spatial mode and players updated),
   * `roomJoinFailed` otherwise. Requests are answered in order; the latest wins.
   */
  joinRoom(roomId: string): void {
    this.pendingRoomId = roomId;
    this.sendJoinRoomRequest(roomId);
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
