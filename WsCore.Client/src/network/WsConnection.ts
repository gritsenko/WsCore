// Message TypeIds. Hand-written, but they MUST mirror the server's
// `public static byte TypeId => N;` declarations under WsServer/WsServer/Game/Protocol/**
// (IServerEvent → ServerEventType, IClientRequest → ClientMessageType).
// WsConnection.test.ts parses the C# sources and fails on any drift in either direction.
export enum ServerEventType {
  GameStateUpdateEvent = 0,
  GameTickUpdateEvent = 1,
  PlayerJoinedEvent = 2,
  PlayerLeftEvent = 3,
  PlayerRespawnEvent = 4,
  SetPlayerHpEvent = 5,
  PlayersTopEvent = 6,
  HeartbeatEvent = 7,
  SetPlayerNameEvent = 100,
  UpdatePlayerSlotsEvent = 102,
  PlayerShootingEvent = 103,
  UpdateMapObjectsEvent = 52,
  InitPlayerEvent = 255,
  ChatMessageEvent = 200,
  RoomListEvent = 250,
  RoomUsersUpdateEvent = 251,
  JoinRoomResultEvent = 252,
}

export enum ClientMessageType {
  GetMapObjectsRequest = 51,
  SetMapObjectRequest = 52,
  DestroyMapObjectRequest = 53,
  SetPlayerNameRequest = 100,
  UpdatePlayerStateRequest = 101,
  UpdatePlayerSlotsRequest = 102,
  PlayerShootingRequest = 103,
  PlayerRespawnRequest = 105,
  UpdatePlayerTargetRequest = 106,
  ChatMessageRequest = 200,
  GetRoomListRequest = 250,
  JoinRoomRequest = 251,
}

// Import all MemoryPack generated types
import { InitPlayerEvent } from './protocol/InitPlayerEvent';
import { PlayerJoinedEvent } from './protocol/PlayerJoinedEvent';
import { PlayerLeftEvent } from './protocol/PlayerLeftEvent';
import { PlayerRespawnEvent } from './protocol/PlayerRespawnEvent';
import { SetPlayerHpEvent } from './protocol/SetPlayerHpEvent';
import { SetPlayerNameEvent } from './protocol/SetPlayerNameEvent';
import { PlayerShootingEvent } from './protocol/PlayerShootingEvent';
import { PlayersTopEvent } from './protocol/PlayersTopEvent';
import { UpdatePlayerSlotsEvent } from './protocol/UpdatePlayerSlotsEvent';
import { UpdateMapObjectsEvent } from './protocol/UpdateMapObjectsEvent';
import { GameStateUpdateEvent } from './protocol/GameStateUpdateEvent';
import { GameTickUpdateEvent } from './protocol/GameTickUpdateEvent';
import { ChatMessageEvent } from './protocol/ChatMessageEvent';
import { RoomListEvent } from './protocol/RoomListEvent';
import { RoomUsersUpdateEvent } from './protocol/RoomUsersUpdateEvent';
import { JoinRoomResultEvent } from './protocol/JoinRoomResultEvent';
import { HeartbeatEvent } from './protocol/HeartbeatEvent';

import { GetMapObjectsRequest } from './protocol/GetMapObjectsRequest';
import { DestroyMapObjectRequest } from './protocol/DestroyMapObjectRequest';
import { SetMapObjectRequest } from './protocol/SetMapObjectRequest';
import { SetPlayerNameRequest } from './protocol/SetPlayerNameRequest';
import { UpdatePlayerStateRequest } from './protocol/UpdatePlayerStateRequest';
import { UpdatePlayerSlotsRequest } from './protocol/UpdatePlayerSlotsRequest';
import { PlayerShootingRequest } from './protocol/PlayerShootingRequest';
import { PlayerRespawnRequest } from './protocol/PlayerRespawnRequest';
import { UpdatePlayerTargetRequest } from './protocol/UpdatePlayerTargetRequest';
import { ChatMessageRequest } from './protocol/ChatMessageRequest';
import { GetRoomListRequest } from './protocol/GetRoomListRequest';
import { JoinRoomRequest } from './protocol/JoinRoomRequest';

import { MemoryPackReader } from './protocol/MemoryPackReader';
import Emitter, { Unsubscribe } from '../utils/Emitter';
import type { ClientEvents, ConnectionStatus, IPlayer } from './ClientEvents';

export type { ClientEvents, ConnectionStatus, IPlayer } from './ClientEvents';

/**
 * Overridable per-event hooks. WsConnection implements them as no-ops; WsClient
 * (or game code) overrides the ones it cares about. The dispatch table calls them
 * through this interface, so overrides are honoured via normal virtual dispatch.
 */
export interface ServerEventHandlers {
  onInitPlayerEvent(msg: InitPlayerEvent): void;
  onPlayerJoinedEvent(msg: PlayerJoinedEvent): void;
  onPlayerLeftEvent(msg: PlayerLeftEvent): void;
  onPlayerRespawnEvent(msg: PlayerRespawnEvent): void;
  onPlayerShootingEvent(msg: PlayerShootingEvent): void;
  onPlayersTopEvent(msg: PlayersTopEvent): void;
  onSetPlayerHpEvent(msg: SetPlayerHpEvent): void;
  onSetPlayerNameEvent(msg: SetPlayerNameEvent): void;
  onUpdatePlayerSlotsEvent(msg: UpdatePlayerSlotsEvent): void;
  onUpdateMapObjectsEvent(msg: UpdateMapObjectsEvent): void;
  onGameStateUpdateEvent(msg: GameStateUpdateEvent): void;
  onGameTickUpdateEvent(msg: GameTickUpdateEvent): void;
  onChatMessageEvent(msg: ChatMessageEvent): void;
  onRoomListEvent(msg: RoomListEvent): void;
  onRoomUsersUpdateEvent(msg: RoomUsersUpdateEvent): void;
  onJoinRoomResultEvent(msg: JoinRoomResultEvent): void;
  onHeartbeatEvent(msg: HeartbeatEvent): void;
}

/** A generated MemoryPack message class, as far as the dispatcher needs it. */
interface MessageType<M> {
  readonly name: string;
  deserializeCore(reader: MemoryPackReader): M | null;
}

/**
 * One row of the dispatch table: the generated class for the payload plus a
 * `dispatch` that decodes it and calls the matching handler. Built once at module
 * load — dispatching a message allocates nothing beyond the decoded message itself.
 */
export interface ServerEventRoute {
  /** The generated message class (its `name` matches the ServerEventType key). */
  readonly type: { readonly name: string };
  /** Decode the payload and invoke the handler. Returns false for a null payload. */
  dispatch(handlers: ServerEventHandlers, reader: MemoryPackReader): boolean;
}

function route<M>(
  type: MessageType<M>,
  handle: (handlers: ServerEventHandlers, msg: M) => void
): ServerEventRoute {
  return {
    type,
    dispatch(handlers, reader) {
      const msg = type.deserializeCore(reader);
      if (msg === null) return false;
      handle(handlers, msg);
      return true;
    },
  };
}

/**
 * Server event dispatch table: TypeId → { payload class, handler }.
 * Adding a server event = one enum member + one entry here (the mapped type makes
 * a missing entry a compile error; WsConnection.test.ts checks it against the server).
 */
export const SERVER_EVENT_ROUTES: { readonly [K in ServerEventType]: ServerEventRoute } = {
  [ServerEventType.GameStateUpdateEvent]: route(GameStateUpdateEvent, (h, m) =>
    h.onGameStateUpdateEvent(m)
  ),
  [ServerEventType.GameTickUpdateEvent]: route(GameTickUpdateEvent, (h, m) =>
    h.onGameTickUpdateEvent(m)
  ),
  [ServerEventType.PlayerJoinedEvent]: route(PlayerJoinedEvent, (h, m) => h.onPlayerJoinedEvent(m)),
  [ServerEventType.PlayerLeftEvent]: route(PlayerLeftEvent, (h, m) => h.onPlayerLeftEvent(m)),
  [ServerEventType.PlayerRespawnEvent]: route(PlayerRespawnEvent, (h, m) =>
    h.onPlayerRespawnEvent(m)
  ),
  [ServerEventType.SetPlayerHpEvent]: route(SetPlayerHpEvent, (h, m) => h.onSetPlayerHpEvent(m)),
  [ServerEventType.PlayersTopEvent]: route(PlayersTopEvent, (h, m) => h.onPlayersTopEvent(m)),
  [ServerEventType.SetPlayerNameEvent]: route(SetPlayerNameEvent, (h, m) =>
    h.onSetPlayerNameEvent(m)
  ),
  [ServerEventType.UpdatePlayerSlotsEvent]: route(UpdatePlayerSlotsEvent, (h, m) =>
    h.onUpdatePlayerSlotsEvent(m)
  ),
  [ServerEventType.PlayerShootingEvent]: route(PlayerShootingEvent, (h, m) =>
    h.onPlayerShootingEvent(m)
  ),
  [ServerEventType.UpdateMapObjectsEvent]: route(UpdateMapObjectsEvent, (h, m) =>
    h.onUpdateMapObjectsEvent(m)
  ),
  [ServerEventType.InitPlayerEvent]: route(InitPlayerEvent, (h, m) => h.onInitPlayerEvent(m)),
  [ServerEventType.ChatMessageEvent]: route(ChatMessageEvent, (h, m) => h.onChatMessageEvent(m)),
  [ServerEventType.RoomListEvent]: route(RoomListEvent, (h, m) => h.onRoomListEvent(m)),
  [ServerEventType.RoomUsersUpdateEvent]: route(RoomUsersUpdateEvent, (h, m) =>
    h.onRoomUsersUpdateEvent(m)
  ),
  [ServerEventType.JoinRoomResultEvent]: route(JoinRoomResultEvent, (h, m) =>
    h.onJoinRoomResultEvent(m)
  ),
  [ServerEventType.HeartbeatEvent]: route(HeartbeatEvent, (h, m) => h.onHeartbeatEvent(m)),
};

// Dense TypeId-indexed view of the table for the hot path (ticks arrive ~30×/s).
const ROUTES_BY_ID: (ServerEventRoute | undefined)[] = new Array(256);
for (const [id, r] of Object.entries(SERVER_EVENT_ROUTES)) ROUTES_BY_ID[Number(id)] = r;

/**
 * WebSocket connection manager using MemoryPack serialization.
 *
 * Owns the transport: one long-lived socket with automatic reconnect + backoff.
 * The socket may be re-created on drop, but this instance lives the whole session.
 * Higher-level app events (players, chat, rooms) are layered on top in WsClient
 * via the shared, `ClientEvents`-typed `emitter`; connection status is emitted here.
 */
export default class WsConnection<T extends IPlayer = IPlayer> implements ServerEventHandlers {
  clientId: number = -1;
  ws: WebSocket | null = null;
  overrideUrl: string | null = null;
  serverUrl: string = '';

  protected readonly emitter = new Emitter<ClientEvents<T>>();

  connectionStatus: ConnectionStatus = 'closed';

  // Reconnect / backoff state
  private intentionalClose = false;
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private static readonly RECONNECT_BASE_MS = 500;
  private static readonly RECONNECT_MAX_MS = 10000;

  /**
   * Watchdog: if NOTHING arrives for this long while the socket is 'open', it is
   * presumed dead (half-open TCP: no FIN, no error, onclose may not fire for minutes)
   * and is dropped into the normal reconnect/backoff path. The server sends a
   * HeartbeatEvent to every connection every 5 s (GameServerOptions
   * .HeartbeatIntervalSeconds), so ~3 missed heartbeats trip it. Instance-overridable
   * for tests.
   */
  static readonly WATCHDOG_TIMEOUT_MS = 15000;
  watchdogTimeoutMs = WsConnection.WATCHDOG_TIMEOUT_MS;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private watchdogPeriodMs = 0;
  private lastMessageAt = 0;
  private lastWatchdogCheckAt = 0;

  /**
   * Subscribe to a client event (see `ClientEvents` for names and signatures).
   * Returns an unsubscribe handle so lobby/game states can detach on teardown.
   */
  on<K extends keyof ClientEvents<T>>(event: K, fn: ClientEvents<T>[K]): Unsubscribe {
    return this.emitter.on(event, fn);
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.connectionStatus === status) return;
    this.connectionStatus = status;
    this.emitter.emit('connectionStatus', status);
  }

  // Event handlers (override these in your game code)
  onInitPlayerEvent(_msg: InitPlayerEvent): void {}
  onPlayerJoinedEvent(_msg: PlayerJoinedEvent): void {}
  onPlayerLeftEvent(_msg: PlayerLeftEvent): void {}
  onPlayerRespawnEvent(_msg: PlayerRespawnEvent): void {}
  onPlayerShootingEvent(_msg: PlayerShootingEvent): void {}
  onPlayersTopEvent(_msg: PlayersTopEvent): void {}
  onSetPlayerHpEvent(_msg: SetPlayerHpEvent): void {}
  onSetPlayerNameEvent(_msg: SetPlayerNameEvent): void {}
  onUpdatePlayerSlotsEvent(_msg: UpdatePlayerSlotsEvent): void {}
  onUpdateMapObjectsEvent(_msg: UpdateMapObjectsEvent): void {}
  onGameStateUpdateEvent(_msg: GameStateUpdateEvent): void {}
  onGameTickUpdateEvent(_msg: GameTickUpdateEvent): void {}
  onChatMessageEvent(_msg: ChatMessageEvent): void {}
  onRoomListEvent(_msg: RoomListEvent): void {}
  onRoomUsersUpdateEvent(_msg: RoomUsersUpdateEvent): void {}
  onJoinRoomResultEvent(_msg: JoinRoomResultEvent): void {}
  /** Nothing to do: its arrival alone feeds the watchdog (see processServerMessage). */
  onHeartbeatEvent(_msg: HeartbeatEvent): void {}

  constructor() {}

  /**
   * Connect to the WebSocket server
   * @param overrideUrl Optional custom WebSocket URL
   */
  connect(overrideUrl?: string): void {
    this.overrideUrl = overrideUrl || null;
    this.intentionalClose = false;
    this.reconnectAttempt = 0;
    this.setStatus('connecting');
    this.openSocket();
  }

  /**
   * Create the socket and wire its lifecycle handlers. Reused by reconnect.
   */
  private openSocket(): void {
    const ws = this.createSocket();
    this.ws = ws;

    ws.onmessage = e => this.processServerMessage(e.data);
    ws.onerror = () => {
      // Fires just before onclose on failure; reconnect is scheduled from onclose.
      console.warn('WebSocket error (will reconnect if not intentional):', ws.url);
    };
    ws.onclose = e => {
      this.stopWatchdog();
      if (this.intentionalClose) {
        this.setStatus('closed');
        return;
      }
      if (e.code === 1006) {
        console.warn('Connection closed abnormally (code 1006). Server unreachable?');
      }
      this.scheduleReconnect();
    };
    ws.onopen = () => {
      console.log('WebSocket connected to:', ws.url);
      this.reconnectAttempt = 0;
      this.setStatus('open');
      this.startWatchdog();
    };
  }

  // ==================== watchdog ====================

  private startWatchdog(): void {
    this.stopWatchdog();
    const now = Date.now();
    this.lastMessageAt = now;
    this.lastWatchdogCheckAt = now;
    // Check several times per timeout window so detection lands close to the deadline.
    this.watchdogPeriodMs = Math.max(100, Math.floor(this.watchdogTimeoutMs / 5));
    this.watchdogTimer = setInterval(() => this.checkWatchdog(), this.watchdogPeriodMs);
    globalThis.document?.addEventListener?.('visibilitychange', this.onVisibilityChange);
  }

  private stopWatchdog(): void {
    if (this.watchdogTimer) clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
    globalThis.document?.removeEventListener?.('visibilitychange', this.onVisibilityChange);
  }

  /**
   * Background tabs: browsers throttle timers (≥1 s, then ~1/min after a while hidden)
   * but keep delivering WebSocket messages, so heartbeats keep `lastMessageAt` fresh
   * and a late check simply sees a recent message. A frozen / suspended page (mobile,
   * laptop sleep) is different: timers AND message delivery stop, and on resume this
   * check may run before the backlog is dispatched. So when the gap since the previous
   * check is far longer than the period, the timer itself was suspended — open a new
   * grace window instead of declaring the socket dead (no reconnect storm on resume).
   */
  private checkWatchdog(): void {
    const now = Date.now();
    const sinceLastCheck = now - this.lastWatchdogCheckAt;
    this.lastWatchdogCheckAt = now;
    if (sinceLastCheck > this.watchdogPeriodMs * 3) {
      this.lastMessageAt = now;
      return;
    }
    if (now - this.lastMessageAt > this.watchdogTimeoutMs) this.onWatchdogExpired();
  }

  // Becoming visible again: same reasoning as the suspended-timer case above.
  private onVisibilityChange = (): void => {
    if (globalThis.document?.visibilityState === 'visible') {
      const now = Date.now();
      this.lastMessageAt = now;
      this.lastWatchdogCheckAt = now;
    }
  };

  private onWatchdogExpired(): void {
    console.warn(
      `No server message for ${this.watchdogTimeoutMs} ms — connection presumed dead, reconnecting`
    );
    this.stopWatchdog();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      // Detach first: a dead socket's onclose may arrive much later (or never) and
      // must not schedule a second reconnect or touch the replacement socket.
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try {
        ws.close();
      } catch {
        /* already closing */
      }
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose || this.reconnectTimer) return;
    this.setStatus('reconnecting');

    const attempt = this.reconnectAttempt++;
    const backoff = Math.min(
      WsConnection.RECONNECT_BASE_MS * 2 ** attempt,
      WsConnection.RECONNECT_MAX_MS
    );
    // ±20% jitter so many clients don't reconnect in lockstep.
    const jitter = backoff * 0.2 * (Math.random() * 2 - 1);
    const delay = Math.max(0, Math.round(backoff + jitter));

    console.log(`Reconnecting in ${delay}ms (attempt ${attempt + 1})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.intentionalClose) return;
      this.openSocket();
    }, delay);
  }

  /**
   * Create and configure WebSocket
   */
  private createSocket(): WebSocket {
    const scheme = document.location.protocol === 'https:' ? 'wss' : 'ws';
    const port = document.location.port ? ':' + document.location.port : '';
    this.serverUrl = `${scheme}://${document.location.hostname}${port}/ws`;

    const url = this.overrideUrl || this.serverUrl;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    return ws;
  }

  /**
   * Process an incoming server frame: `[TypeId: 1 byte][MemoryPack payload]`.
   * Protected (not private) so tests can feed frames without a socket.
   */
  protected processServerMessage(data: ArrayBuffer): void {
    this.lastMessageAt = Date.now(); // any message proves the connection is alive
    try {
      const reader = new MemoryPackReader(data);
      const messageType = reader.readUint8();
      const route = ROUTES_BY_ID[messageType];
      if (!route) {
        console.warn(`Unknown server message type: ${messageType}`);
      } else if (!route.dispatch(this, reader)) {
        console.warn(`Null payload for server message ${route.type.name} (${messageType})`);
      }
    } catch (error) {
      console.error('Error processing server message:', error);
    }
  }

  /**
   * Send a message to the server
   */
  private sendMessage(messageType: ClientMessageType, data: Uint8Array): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // Drop while not OPEN. We deliberately do NOT queue: the server assigns a
      // fresh clientId on reconnect, so replaying stale inputs would be wrong.
      // Control messages (name/slots/join) are re-sent by the re-init sequence.
      return;
    }

    // Create buffer with message type prefix
    const buffer = new Uint8Array(1 + data.length);
    buffer[0] = messageType;
    buffer.set(data, 1);

    this.ws.send(buffer);
  }

  // ==================== Client Request Methods ====================

  sendPlayerRespawnRequest(): void {
    const request = new PlayerRespawnRequest();
    const data = PlayerRespawnRequest.serialize(request);
    this.sendMessage(ClientMessageType.PlayerRespawnRequest, data);
  }

  sendPlayerShootingRequest(weapon: number): void {
    const request = new PlayerShootingRequest();
    request.weapon = weapon;
    const data = PlayerShootingRequest.serialize(request);
    this.sendMessage(ClientMessageType.PlayerShootingRequest, data);
  }

  sendSetPlayerNameRequest(name: string): void {
    const request = new SetPlayerNameRequest();
    request.name = name;
    const data = SetPlayerNameRequest.serialize(request);
    this.sendMessage(ClientMessageType.SetPlayerNameRequest, data);
  }

  sendUpdatePlayerSlotsRequest(body: number, gun: number, armor: number): void {
    const request = new UpdatePlayerSlotsRequest();
    request.body = body;
    request.gun = gun;
    request.armor = armor;
    const data = UpdatePlayerSlotsRequest.serialize(request);
    this.sendMessage(ClientMessageType.UpdatePlayerSlotsRequest, data);
  }

  sendUpdatePlayerStateRequest(aimX: number, aimY: number, controlsState: number): void {
    const request = new UpdatePlayerStateRequest();
    request.aimX = aimX;
    request.aimY = aimY;
    request.controlsState = controlsState;
    const data = UpdatePlayerStateRequest.serialize(request);
    this.sendMessage(ClientMessageType.UpdatePlayerStateRequest, data);
  }

  sendUpdatePlayerTargetRequest(aimX: number, aimY: number): void {
    const request = new UpdatePlayerTargetRequest();
    request.aimX = aimX;
    request.aimY = aimY;
    const data = UpdatePlayerTargetRequest.serialize(request);
    this.sendMessage(ClientMessageType.UpdatePlayerTargetRequest, data);
  }

  sendDestroyMapObjectRequest(mapX: number, mapY: number): void {
    const request = new DestroyMapObjectRequest();
    request.mapX = mapX;
    request.mapY = mapY;
    const data = DestroyMapObjectRequest.serialize(request);
    this.sendMessage(ClientMessageType.DestroyMapObjectRequest, data);
  }

  sendGetMapObjectsRequest(mapX: number, mapY: number): void {
    const request = new GetMapObjectsRequest();
    request.mapX = mapX;
    request.mapY = mapY;
    const data = GetMapObjectsRequest.serialize(request);
    this.sendMessage(ClientMessageType.GetMapObjectsRequest, data);
  }

  sendSetMapObjectRequest(mapX: number, mapY: number, objectType: number): void {
    const request = new SetMapObjectRequest();
    request.mapX = mapX;
    request.mapY = mapY;
    request.objectType = objectType;
    const data = SetMapObjectRequest.serialize(request);
    this.sendMessage(ClientMessageType.SetMapObjectRequest, data);
  }

  sendChatMessageRequest(message: string): void {
    const request = new ChatMessageRequest();
    request.message = message;
    const data = ChatMessageRequest.serialize(request);
    this.sendMessage(ClientMessageType.ChatMessageRequest, data);
  }

  sendGetRoomListRequest(): void {
    const request = new GetRoomListRequest();
    const data = GetRoomListRequest.serialize(request);
    this.sendMessage(ClientMessageType.GetRoomListRequest, data);
  }

  sendJoinRoomRequest(roomId: string): void {
    const request = new JoinRoomRequest();
    request.roomId = roomId;
    const data = JoinRoomRequest.serialize(request);
    this.sendMessage(ClientMessageType.JoinRoomRequest, data);
  }

  /**
   * Close the WebSocket connection intentionally (no reconnect).
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.stopWatchdog();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.setStatus('closed');
  }
}
