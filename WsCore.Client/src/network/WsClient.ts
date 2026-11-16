import WsConnection from './WsConnection';
import { AccountAction } from './ClientEvents';
import type { IPlayer, PresenceUser } from './ClientEvents';
import { AccountResultEvent } from './protocol/AccountResultEvent';
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
import { ChatHistoryEvent } from './protocol/ChatHistoryEvent';
import { PresenceSnapshotEvent } from './protocol/PresenceSnapshotEvent';
import { PresenceUpdateEvent } from './protocol/PresenceUpdateEvent';
import { PresenceUserInfo } from './protocol/PresenceUserInfo';
import { ChatEntry, ChatLogStore, ChatRoomLog } from './ChatLog';
import { ChatMessageDeletedEvent } from './protocol/ChatMessageDeletedEvent';
import { ChannelPermissionsEvent } from './protocol/ChannelPermissionsEvent';
import { ModerationResultEvent } from './protocol/ModerationResultEvent';
import { PushConfigEvent } from './protocol/PushConfigEvent';
import {
  ChannelAdmin,
  ChannelPermissions,
  ChannelRestriction,
  MemberPermission,
  PermissionStore,
  Subject,
} from './Permissions';

export type { IPlayer } from './ClientEvents';

function toPresenceUser(info: PresenceUserInfo): PresenceUser {
  return {
    userId: info.userId,
    name: info.name || `User ${info.userId}`,
    status: info.status,
    roomId: info.roomId || null,
    lastSeenMs: info.lastSeenMs,
    about: info.about || '',
    avatarVersion: info.avatarVersion,
    login: info.login || null,
    isAdmin: info.isAdmin,
  };
}

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

  /**
   * Our stable identity: a random secret kept in local storage and sent on every
   * (re)connect, so the server knows us as the same user although the clientId changes.
   * Empty = stay anonymous (no member-list entry).
   */
  userKey = '';
  /**
   * Identify without a name, so the server keeps the one it has for us. Set when
   * entering a claimed account from a remembered key: the name stored in this browser
   * may be stale (the account can be renamed on another device).
   */
  keepServerName = false;
  /** Our user id, once the server answered the identify (0 until then). */
  myUserId = 0;
  /** The member list: every known user — online, away and offline. */
  readonly presence = new Map<number, PresenceUser>();
  /**
   * The login of our account once it is claimed; null while we are a guest (a user
   * that exists only through the key in this browser).
   */
  myLogin: string | null = null;
  /** Credentials to enter an account with instead of identifying (see loginOnConnect). */
  private pendingLogin: { login: string; password: string; userKey: string } | null = null;
  /**
   * The server's VAPID public key (base64url) — what a Web Push subscription must be
   * made with. Null until the server sent it after the identify (or push is off there).
   */
  pushPublicKey: string | null = null;
  /** Whether we last reported ourselves idle; re-sent on every new session. */
  private away = false;

  /** Roles and permissions per channel (server-sent; see Permissions.ts). */
  readonly permissions = new PermissionStore();

  /** Per-room chat cache; survives room switches, lobby↔game and reconnects. */
  readonly chatLog = new ChatLogStore();
  /** Give up waiting for an older-history page after this long (the request was lost). */
  static readonly HISTORY_TIMEOUT_MS = 8000;
  private historyTimer: ReturnType<typeof setTimeout> | null = null;

  override onInitPlayerEvent(msg: InitPlayerEvent): void {
    // Every InitPlayerEvent (first connect OR reconnect) starts a fresh session:
    // the server assigns a new clientId and knows nothing about the previous one.
    this.resetSession();

    this.clientId = msg.clientId;
    this.awaitingHomeRoom = true;
    console.log('Player initialized', this.clientId);
    // Session identity (kept server-side even without an avatar) and the room list.
    // Identifying also sets the name; an anonymous client only sets the name.
    // Entering an account from this device replaces the identify until it is answered.
    if (this.pendingLogin) {
      const { login, password, userKey } = this.pendingLogin;
      this.sendLoginRequest(login, password, userKey);
    } else if (this.userKey) {
      this.sendIdentifyRequest(this.userKey, this.keepServerName ? '' : this.myPlayerName);
    } else this.sendSetPlayerNameRequest(this.myPlayerName);
    if (this.away) this.sendSetAwayRequest(true); // a new session starts as "active"
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
    // Chat is per room and the server only sends us our own room's.
    const roomId = this.getCurrentRoom()?.id;
    if (!roomId) return;

    const entry: ChatEntry = {
      id: msg.id,
      userId: msg.userId,
      name: msg.name || this.resolveName(msg.clientId),
      text: msg.message || '',
      sentAtMs: msg.sentAtMs || Date.now(),
    };
    switch (this.chatLog.addLive(roomId, entry)) {
      case 'added':
        this.emitter.emit('chat', roomId, entry);
        break;
      case 'trimmed':
        this.emitter.emit('chatHistory', roomId, { kind: 'reset' });
        break;
      // 'duplicate': already delivered by a history page.
    }
  }

  override onChatHistoryEvent(msg: ChatHistoryEvent): void {
    const roomId = msg.roomId || '';
    const messages: ChatEntry[] = [];
    for (const m of msg.messages ?? []) {
      if (!m) continue;
      messages.push({
        id: m.id,
        userId: m.userId,
        name: m.name || '',
        text: m.text || '',
        sentAtMs: m.sentAtMs,
      });
    }

    if (msg.beforeId !== 0) this.clearHistoryTimer();
    const change = this.chatLog.applyHistory({
      roomId,
      epoch: msg.epoch,
      beforeId: msg.beforeId,
      reset: msg.reset,
      hasMore: msg.hasMore,
      messages,
    });
    if (change) this.emitter.emit('chatHistory', roomId, change);
  }

  override onPresenceSnapshotEvent(msg: PresenceSnapshotEvent): void {
    this.myUserId = msg.yourUserId;
    this.myLogin = msg.yourLogin || null;
    this.presence.clear();
    for (const info of msg.users ?? []) {
      if (info) this.presence.set(info.userId, toPresenceUser(info));
    }
    this.emitter.emit('presence');
  }

  override onPresenceUpdateEvent(msg: PresenceUpdateEvent): void {
    if (!msg.user) return;
    this.presence.set(msg.user.userId, toPresenceUser(msg.user));
    this.emitter.emit('presence');
  }

  override onChannelPermissionsEvent(msg: ChannelPermissionsEvent): void {
    const channels: ChannelPermissions[] = [];
    for (const info of msg.channels ?? []) {
      if (!info?.roomId) continue;
      const admins = new Map<number, ChannelAdmin>();
      for (const a of info.admins ?? []) {
        if (a) admins.set(a.userId, { userId: a.userId, rights: a.rights, title: a.title || '' });
      }
      const restrictions = new Map<number, ChannelRestriction>();
      for (const r of info.restrictions ?? []) {
        if (r)
          restrictions.set(r.userId, {
            userId: r.userId,
            denied: r.denied,
            banned: r.banned,
            untilMs: r.untilMs,
          });
      }
      channels.push({
        roomId: info.roomId,
        defaults: info.defaultPermissions,
        admins,
        restrictions,
      });
    }
    this.permissions.apply(channels, msg.reset);
    this.emitter.emit('permissions');
  }

  override onModerationResultEvent(msg: ModerationResultEvent): void {
    this.emitter.emit('moderation', {
      action: msg.action,
      success: msg.success,
      error: msg.success ? null : msg.error || 'failed',
    });
  }

  override onChatMessageDeletedEvent(msg: ChatMessageDeletedEvent): void {
    const roomId = msg.roomId || '';
    if (this.chatLog.remove(roomId, msg.messageId))
      this.emitter.emit('chatDeleted', roomId, msg.messageId);
  }

  override onPushConfigEvent(msg: PushConfigEvent): void {
    this.pushPublicKey = msg.publicKey || null;
    // Sent on every identify: the subscription is (re)registered for the user we now are.
    if (this.pushPublicKey) this.emitter.emit('pushConfig', this.pushPublicKey);
  }

  /** Register this browser's push subscription for our user (idempotent on the server). */
  subscribePush(endpoint: string, p256dh: string, auth: string): void {
    if (this.clientId < 0 || !this.myUserId) return;
    this.sendPushSubscribeRequest(endpoint, p256dh, auth);
  }

  /** Stop push notifications to this browser's subscription. */
  unsubscribePush(endpoint: string): void {
    if (this.clientId < 0 || !this.myUserId) return;
    this.sendPushUnsubscribeRequest(endpoint);
  }

  override onAccountResultEvent(msg: AccountResultEvent): void {
    const login = msg.login || null;
    switch (msg.action) {
      case AccountAction.Login:
        // Success: the key we made up is now a key of the account — from here on this
        // device identifies with it (the member list follows as a presence snapshot).
        if (msg.success && this.pendingLogin) {
          this.userKey = this.pendingLogin.userKey;
          this.myLogin = login;
        }
        this.pendingLogin = null;
        break;
      case AccountAction.Claim:
        if (msg.success) this.myLogin = login;
        break;
      case AccountAction.Logout:
        if (msg.success) {
          // The key no longer identifies anyone, and this connection is anonymous.
          this.userKey = '';
          this.myLogin = null;
          this.myUserId = 0;
        }
        break;
    }
    this.emitter.emit('account', {
      action: msg.action,
      success: msg.success,
      error: msg.success ? null : msg.error || 'failed',
    });
  }

  /**
   * Enter the claimed account `login` instead of identifying as a guest: sent on the
   * next session init (call before connect()). `userKey` is a fresh random key that
   * becomes this device's key for the account if the login succeeds — it is adopted as
   * `userKey` then; the outcome arrives as an `account` event.
   */
  loginOnConnect(login: string, password: string, userKey: string): void {
    this.pendingLogin = { login, password, userKey };
  }

  /** Give our guest user a login + password, so it can be entered from other devices. */
  claimAccount(login: string, password: string): void {
    this.sendClaimAccountRequest(login, password);
  }

  /** Leave the account on this device (its key stops working). */
  logout(): void {
    this.sendLogoutRequest();
  }

  setAbout(about: string): void {
    this.sendUpdateProfileRequest(about);
  }

  /** Upload an avatar file (already downsized — see utils/AvatarImage); null removes it. */
  setAvatar(image: Uint8Array | null): void {
    this.sendSetAvatarRequest(image ?? new Uint8Array(0));
  }

  /** Us as the permission rules see us (undefined until identified). */
  get subject(): Subject | undefined {
    const me = this.me;
    return me ? { userId: me.userId, isAdmin: me.isAdmin } : undefined;
  }

  /** A known user as the permission rules see them. */
  subjectOf(userId: number): Subject | undefined {
    const user = this.presence.get(userId);
    return user
      ? { userId, isAdmin: user.isAdmin }
      : userId
        ? { userId, isAdmin: false }
        : undefined;
  }

  /** Whether we may write in the room (not muted / banned there). */
  canSendIn(roomId: string): boolean {
    const allowed = this.permissions.permissionsOf(this.subject, roomId);
    return (allowed & MemberPermission.SendMessages) !== 0;
  }

  /** Whether we may delete a message of `authorId` in the room. */
  canDeleteIn(roomId: string, authorId: number): boolean {
    return this.permissions.canDelete(this.subject, roomId, authorId);
  }

  deleteMessage(roomId: string, messageId: number): void {
    this.sendDeleteChatMessageRequest(roomId, messageId);
  }

  /** Promote / update (rights != 0) or demote (rights = 0) a channel admin. */
  setChannelAdmin(roomId: string, userId: number, rights: number, title: string): void {
    this.sendSetChannelAdminRequest(roomId, userId, rights, title);
  }

  /** Restrict a member for `durationSeconds` (0 = forever); denied 0 + not banned lifts it. */
  restrictMember(
    roomId: string,
    userId: number,
    denied: number,
    banned: boolean,
    durationSeconds: number
  ): void {
    this.sendSetChannelRestrictionRequest(roomId, userId, denied, banned, durationSeconds);
  }

  setChannelDefaults(roomId: string, defaults: number): void {
    this.sendSetChannelDefaultsRequest(roomId, defaults);
  }

  setServerAdmin(userId: number, isAdmin: boolean): void {
    this.sendSetServerAdminRequest(userId, isAdmin);
  }

  rename(name: string): void {
    this.sendSetPlayerNameRequest(name);
  }

  /** Our own entry of the member list (undefined until identified). */
  get me(): PresenceUser | undefined {
    return this.myUserId ? this.presence.get(this.myUserId) : undefined;
  }

  /**
   * Where a user's avatar image is served (null if they have none): the game server's
   * HTTP side — the same host the socket talks to, which in dev is not the page's.
   * The version makes the URL immutable, so the browser caches it forever.
   */
  avatarUrl(
    user: Pick<PresenceUser, 'userId' | 'avatarVersion'> | undefined | null
  ): string | null {
    if (!user || !user.avatarVersion) return null;
    const socketUrl = this.overrideUrl || this.serverUrl;
    if (!socketUrl) return null;
    const base = socketUrl.replace(/^ws/, 'http').replace(/\/ws\/?$/, '');
    return `${base}/avatars/${user.userId}?v=${user.avatarVersion}`;
  }

  /** Whether a chat entry was written by us (by user — so it holds across reconnects). */
  isOwnMessage(entry: ChatEntry): boolean {
    return entry.userId !== 0 && entry.userId === this.myUserId;
  }

  /** The cached chat log of a room (empty until its first history page arrives). */
  getChatLog(roomId: string): ChatRoomLog {
    return this.chatLog.room(roomId);
  }

  /**
   * Ask for the page of messages before the oldest one we have in our current room.
   * Returns false when there is nothing to load or a page is already on its way; the
   * answer arrives as a `chatHistory` 'prepend' (empty if the request timed out).
   */
  loadOlderChat(): boolean {
    const roomId = this.getCurrentRoom()?.id;
    if (!roomId) return false;
    const log = this.chatLog.room(roomId);
    if (!log.hasMore || log.loadingOlder || log.entries.length === 0) return false;

    log.loadingOlder = true;
    this.sendChatHistoryRequest(log.firstId, 0, this.chatLog.epoch);
    this.clearHistoryTimer();
    this.historyTimer = setTimeout(() => {
      this.historyTimer = null;
      if (!log.loadingOlder) return;
      log.loadingOlder = false;
      this.emitter.emit('chatHistory', roomId, { kind: 'prepend', entries: [] });
    }, WsClient.HISTORY_TIMEOUT_MS);
    return true;
  }

  private clearHistoryTimer(): void {
    if (this.historyTimer) clearTimeout(this.historyTimer);
    this.historyTimer = null;
  }

  /** Report that the user went idle / came back (see IdleDetector). */
  setAway(away: boolean): void {
    if (this.away === away) return;
    this.away = away;
    this.sendSetAwayRequest(away);
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

    // Chat: what we have cached for the room is shown at once (by the roomJoined
    // listeners above); fetch only what we missed since — or the latest page if nothing
    // is cached. Sent after the join so the server answers for this room.
    this.sendChatHistoryRequest(0, this.chatLog.room(roomId).lastId, this.chatLog.epoch);
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
            const added = room.getClient(userInfo.clientId);
            if (added) added.userId = userInfo.userId;
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
    // The chat cache is deliberately kept (message ids stay valid across sessions; the
    // next join only fetches what was missed).
    this.chatLog.onSessionReset();
    this.clearHistoryTimer();
    // The member list and our user id are kept too: the same userKey identifies as the
    // same user, and the snapshot that answers the identify replaces the list.
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
