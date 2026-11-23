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
  ChatHistoryEvent = 201,
  ChatMessageDeletedEvent = 202,
  ChannelPermissionsEvent = 120,
  ModerationResultEvent = 121,
  PresenceSnapshotEvent = 110,
  PresenceUpdateEvent = 111,
  AccountResultEvent = 112,
  PushConfigEvent = 130,
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
  ChatHistoryRequest = 201,
  DeleteChatMessageRequest = 202,
  SetChannelAdminRequest = 120,
  SetChannelRestrictionRequest = 121,
  SetChannelDefaultsRequest = 122,
  SetServerAdminRequest = 123,
  CreateChannelRequest = 124,
  UpdateChannelRequest = 125,
  DeleteChannelRequest = 126,
  SetChannelAccessRequest = 127,
  IdentifyRequest = 110,
  SetAwayRequest = 111,
  ClaimAccountRequest = 112,
  LoginRequest = 113,
  LogoutRequest = 114,
  UpdateProfileRequest = 115,
  SetAvatarRequest = 116,
  PushSubscribeRequest = 130,
  PushUnsubscribeRequest = 131,
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
import { ChatHistoryRequest } from './protocol/ChatHistoryRequest';
import { ChatHistoryEvent } from './protocol/ChatHistoryEvent';
import { IdentifyRequest } from './protocol/IdentifyRequest';
import { SetAwayRequest } from './protocol/SetAwayRequest';
import { PresenceSnapshotEvent } from './protocol/PresenceSnapshotEvent';
import { PresenceUpdateEvent } from './protocol/PresenceUpdateEvent';
import { AccountResultEvent } from './protocol/AccountResultEvent';
import { ClaimAccountRequest } from './protocol/ClaimAccountRequest';
import { LoginRequest } from './protocol/LoginRequest';
import { LogoutRequest } from './protocol/LogoutRequest';
import { UpdateProfileRequest } from './protocol/UpdateProfileRequest';
import { SetAvatarRequest } from './protocol/SetAvatarRequest';
import { GetRoomListRequest } from './protocol/GetRoomListRequest';
import { JoinRoomRequest } from './protocol/JoinRoomRequest';
import { ChatMessageDeletedEvent } from './protocol/ChatMessageDeletedEvent';
import { ChannelPermissionsEvent } from './protocol/ChannelPermissionsEvent';
import { ModerationResultEvent } from './protocol/ModerationResultEvent';
import { DeleteChatMessageRequest } from './protocol/DeleteChatMessageRequest';
import { SetChannelAdminRequest } from './protocol/SetChannelAdminRequest';
import { SetChannelRestrictionRequest } from './protocol/SetChannelRestrictionRequest';
import { SetChannelDefaultsRequest } from './protocol/SetChannelDefaultsRequest';
import { SetServerAdminRequest } from './protocol/SetServerAdminRequest';
import { CreateChannelRequest } from './protocol/CreateChannelRequest';
import { UpdateChannelRequest } from './protocol/UpdateChannelRequest';
import { DeleteChannelRequest } from './protocol/DeleteChannelRequest';
import { SetChannelAccessRequest } from './protocol/SetChannelAccessRequest';
import { PushConfigEvent } from './protocol/PushConfigEvent';
import { PushSubscribeRequest } from './protocol/PushSubscribeRequest';
import { PushUnsubscribeRequest } from './protocol/PushUnsubscribeRequest';

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
  onChatHistoryEvent(msg: ChatHistoryEvent): void;
  onChatMessageDeletedEvent(msg: ChatMessageDeletedEvent): void;
  onChannelPermissionsEvent(msg: ChannelPermissionsEvent): void;
  onModerationResultEvent(msg: ModerationResultEvent): void;
  onPresenceSnapshotEvent(msg: PresenceSnapshotEvent): void;
  onPresenceUpdateEvent(msg: PresenceUpdateEvent): void;
  onAccountResultEvent(msg: AccountResultEvent): void;
  onPushConfigEvent(msg: PushConfigEvent): void;
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
  [ServerEventType.ChatHistoryEvent]: route(ChatHistoryEvent, (h, m) => h.onChatHistoryEvent(m)),
  [ServerEventType.ChatMessageDeletedEvent]: route(ChatMessageDeletedEvent, (h, m) =>
    h.onChatMessageDeletedEvent(m)
  ),
  [ServerEventType.ChannelPermissionsEvent]: route(ChannelPermissionsEvent, (h, m) =>
    h.onChannelPermissionsEvent(m)
  ),
  [ServerEventType.ModerationResultEvent]: route(ModerationResultEvent, (h, m) =>
    h.onModerationResultEvent(m)
  ),
  [ServerEventType.PresenceSnapshotEvent]: route(PresenceSnapshotEvent, (h, m) =>
    h.onPresenceSnapshotEvent(m)
  ),
  [ServerEventType.PresenceUpdateEvent]: route(PresenceUpdateEvent, (h, m) =>
    h.onPresenceUpdateEvent(m)
  ),
  [ServerEventType.AccountResultEvent]: route(AccountResultEvent, (h, m) =>
    h.onAccountResultEvent(m)
  ),
  [ServerEventType.PushConfigEvent]: route(PushConfigEvent, (h, m) => h.onPushConfigEvent(m)),
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
  onChatHistoryEvent(_msg: ChatHistoryEvent): void {}
  onChatMessageDeletedEvent(_msg: ChatMessageDeletedEvent): void {}
  onChannelPermissionsEvent(_msg: ChannelPermissionsEvent): void {}
  onModerationResultEvent(_msg: ModerationResultEvent): void {}
  onPresenceSnapshotEvent(_msg: PresenceSnapshotEvent): void {}
  onPresenceUpdateEvent(_msg: PresenceUpdateEvent): void {}
  onAccountResultEvent(_msg: AccountResultEvent): void {}
  onPushConfigEvent(_msg: PushConfigEvent): void {}
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

  /** History of our current room: the page before `beforeId`, or a catch-up after `afterId`. */
  sendChatHistoryRequest(beforeId: number, afterId: number, epoch: number): void {
    const request = new ChatHistoryRequest();
    request.beforeId = beforeId;
    request.afterId = afterId;
    request.epoch = epoch;
    const data = ChatHistoryRequest.serialize(request);
    this.sendMessage(ClientMessageType.ChatHistoryRequest, data);
  }

  /** Bind this connection to our stable user (and set the display name). */
  sendIdentifyRequest(userKey: string, name: string): void {
    const request = new IdentifyRequest();
    request.userKey = userKey;
    request.name = name;
    const data = IdentifyRequest.serialize(request);
    this.sendMessage(ClientMessageType.IdentifyRequest, data);
  }

  /** Register this browser's Web Push subscription for our user (see PushSubscribeRequest). */
  sendPushSubscribeRequest(endpoint: string, p256dh: string, auth: string): void {
    const request = new PushSubscribeRequest();
    request.endpoint = endpoint;
    request.p256dh = p256dh;
    request.auth = auth;
    this.sendMessage(
      ClientMessageType.PushSubscribeRequest,
      PushSubscribeRequest.serialize(request)
    );
  }

  sendPushUnsubscribeRequest(endpoint: string): void {
    const request = new PushUnsubscribeRequest();
    request.endpoint = endpoint;
    this.sendMessage(
      ClientMessageType.PushUnsubscribeRequest,
      PushUnsubscribeRequest.serialize(request)
    );
  }

  sendSetAwayRequest(away: boolean): void {
    const request = new SetAwayRequest();
    request.away = away;
    const data = SetAwayRequest.serialize(request);
    this.sendMessage(ClientMessageType.SetAwayRequest, data);
  }

  /** Claim our guest user: give it a login + password (answered by AccountResultEvent). */
  sendClaimAccountRequest(login: string, password: string): void {
    const request = new ClaimAccountRequest();
    request.login = login;
    request.password = password;
    const data = ClaimAccountRequest.serialize(request);
    this.sendMessage(ClientMessageType.ClaimAccountRequest, data);
  }

  /** Enter a claimed account; `userKey` becomes this device's key for it. */
  sendLoginRequest(login: string, password: string, userKey: string): void {
    const request = new LoginRequest();
    request.login = login;
    request.password = password;
    request.userKey = userKey;
    const data = LoginRequest.serialize(request);
    this.sendMessage(ClientMessageType.LoginRequest, data);
  }

  sendLogoutRequest(): void {
    const request = new LogoutRequest();
    const data = LogoutRequest.serialize(request);
    this.sendMessage(ClientMessageType.LogoutRequest, data);
  }

  sendUpdateProfileRequest(about: string): void {
    const request = new UpdateProfileRequest();
    request.about = about;
    const data = UpdateProfileRequest.serialize(request);
    this.sendMessage(ClientMessageType.UpdateProfileRequest, data);
  }

  /** A small PNG / JPEG / WebP file; empty removes the avatar. */
  sendSetAvatarRequest(image: Uint8Array): void {
    const request = new SetAvatarRequest();
    request.image = image;
    const data = SetAvatarRequest.serialize(request);
    this.sendMessage(ClientMessageType.SetAvatarRequest, data);
  }

  sendDeleteChatMessageRequest(roomId: string, messageId: number): void {
    const request = new DeleteChatMessageRequest();
    request.roomId = roomId;
    request.messageId = messageId;
    this.sendMessage(
      ClientMessageType.DeleteChatMessageRequest,
      DeleteChatMessageRequest.serialize(request)
    );
  }

  /** Promote / update (rights != 0) or demote (rights = 0) a channel admin. */
  sendSetChannelAdminRequest(roomId: string, userId: number, rights: number, title: string): void {
    const request = new SetChannelAdminRequest();
    request.roomId = roomId;
    request.userId = userId;
    request.rights = rights;
    request.title = title;
    this.sendMessage(
      ClientMessageType.SetChannelAdminRequest,
      SetChannelAdminRequest.serialize(request)
    );
  }

  /** Restrict a member (denied permissions / ban) for `durationSeconds` (0 = forever); nothing = lift. */
  sendSetChannelRestrictionRequest(
    roomId: string,
    userId: number,
    denied: number,
    banned: boolean,
    durationSeconds: number
  ): void {
    const request = new SetChannelRestrictionRequest();
    request.roomId = roomId;
    request.userId = userId;
    request.denied = denied;
    request.banned = banned;
    request.durationSeconds = durationSeconds;
    this.sendMessage(
      ClientMessageType.SetChannelRestrictionRequest,
      SetChannelRestrictionRequest.serialize(request)
    );
  }

  sendSetChannelDefaultsRequest(roomId: string, defaultPermissions: number): void {
    const request = new SetChannelDefaultsRequest();
    request.roomId = roomId;
    request.defaultPermissions = defaultPermissions;
    this.sendMessage(
      ClientMessageType.SetChannelDefaultsRequest,
      SetChannelDefaultsRequest.serialize(request)
    );
  }

  sendSetServerAdminRequest(userId: number, isAdmin: boolean): void {
    const request = new SetServerAdminRequest();
    request.userId = userId;
    request.isAdmin = isAdmin;
    this.sendMessage(
      ClientMessageType.SetServerAdminRequest,
      SetServerAdminRequest.serialize(request)
    );
  }

  sendCreateChannelRequest(name: string, isPrivate: boolean): void {
    const request = new CreateChannelRequest();
    request.name = name;
    request.isPrivate = isPrivate;
    this.sendMessage(
      ClientMessageType.CreateChannelRequest,
      CreateChannelRequest.serialize(request)
    );
  }

  sendUpdateChannelRequest(roomId: string, name: string, isPrivate: boolean): void {
    const request = new UpdateChannelRequest();
    request.roomId = roomId;
    request.name = name;
    request.isPrivate = isPrivate;
    this.sendMessage(
      ClientMessageType.UpdateChannelRequest,
      UpdateChannelRequest.serialize(request)
    );
  }

  sendDeleteChannelRequest(roomId: string): void {
    const request = new DeleteChannelRequest();
    request.roomId = roomId;
    this.sendMessage(
      ClientMessageType.DeleteChannelRequest,
      DeleteChannelRequest.serialize(request)
    );
  }

  sendSetChannelAccessRequest(roomId: string, userId: number, hasAccess: boolean): void {
    const request = new SetChannelAccessRequest();
    request.roomId = roomId;
    request.userId = userId;
    request.hasAccess = hasAccess;
    this.sendMessage(
      ClientMessageType.SetChannelAccessRequest,
      SetChannelAccessRequest.serialize(request)
    );
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
