import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WsClient from './WsClient';
import Player from '../game/Player';
import { InitPlayerEvent } from './protocol/InitPlayerEvent';
import { RoomInfo } from './protocol/RoomInfo';
import { RoomListEvent } from './protocol/RoomListEvent';
import { JoinRoomResultEvent } from './protocol/JoinRoomResultEvent';
import { GameStateUpdateEvent } from './protocol/GameStateUpdateEvent';
import { GameTickUpdateEvent } from './protocol/GameTickUpdateEvent';
import { PlayerStateData } from './protocol/PlayerStateData';
import { MovementStateData } from './protocol/MovementStateData';
import { PlayerJoinedEvent } from './protocol/PlayerJoinedEvent';
import { RoomUsersUpdateEvent } from './protocol/RoomUsersUpdateEvent';
import { RoomUserInfo } from './protocol/RoomUserInfo';
import { SetPlayerNameEvent } from './protocol/SetPlayerNameEvent';
import { ChatMessageEvent } from './protocol/ChatMessageEvent';
import { CommunicationMode } from './rooms/CommunicationMode';
import { ChatHistoryEvent } from './protocol/ChatHistoryEvent';
import { ChatMessageData } from './protocol/ChatMessageData';
import { PresenceSnapshotEvent } from './protocol/PresenceSnapshotEvent';
import { PresenceUpdateEvent } from './protocol/PresenceUpdateEvent';
import { PresenceUserInfo } from './protocol/PresenceUserInfo';
import { AccountAction, PresenceStatus } from './ClientEvents';
import { AccountResultEvent } from './protocol/AccountResultEvent';

// Session-level behaviour of WsClient: rooms come from the server, joins are
// server-confirmed, and players exist only while we're in a spatial room. Messages are
// fed straight into the handler hooks (no socket: outgoing requests are dropped).

function roomInfo(id: string, modes: string[], userCount = 0): RoomInfo {
  const r = new RoomInfo();
  r.id = id;
  r.name = id.toUpperCase();
  r.supportedModes = modes;
  r.isPersistent = true;
  r.userCount = userCount;
  return r;
}

const LOBBY = () => roomInfo('lobby', ['TextChat'], 1);
const GAME = () => roomInfo('game', ['TextChat', 'Spatial']);

function roomList(...rooms: RoomInfo[]): RoomListEvent {
  const e = new RoomListEvent();
  e.rooms = rooms;
  return e;
}

function joined(room: RoomInfo): JoinRoomResultEvent {
  const e = new JoinRoomResultEvent();
  e.roomId = room.id;
  e.success = true;
  e.room = room;
  return e;
}

function refused(roomId: string, error: string): JoinRoomResultEvent {
  const e = new JoinRoomResultEvent();
  e.roomId = roomId;
  e.success = false;
  e.error = error;
  return e;
}

function playerData(id: number, name = `P${id}`): PlayerStateData {
  const p = new PlayerStateData();
  p.id = id;
  p.name = name;
  p.hp = 100;
  p.maxHp = 100;
  p.movementState = new MovementStateData();
  return p;
}

function gameState(...ids: number[]): GameStateUpdateEvent {
  const e = new GameStateUpdateEvent();
  e.playerStateData = ids.map(id => playerData(id));
  return e;
}

function init(id: number): InitPlayerEvent {
  const e = new InitPlayerEvent();
  e.clientId = id;
  return e;
}

function newClient() {
  const client = new WsClient<Player>();
  client.playerFactory = id => new Player(id);
  const events: string[] = [];
  client.on('playerCreate', p => events.push(`create:${p.id}`));
  client.on('playerRemove', p => events.push(`remove:${p.id}`));
  client.on('roomJoined', id => events.push(`joined:${id}`));
  client.on('roomJoinFailed', (id, err) => events.push(`failed:${id}:${err}`));
  client.on('roomList', rooms => events.push(`list:${rooms.map(r => r.id).join(',')}`));
  const joins = vi.spyOn(client, 'sendJoinRoomRequest');
  const listRequests = vi.spyOn(client, 'sendGetRoomListRequest');
  return { client, events, joins, listRequests };
}

/** Connected client sitting in the lobby (as after the server's automatic join). */
function inLobby(id = 5) {
  const t = newClient();
  t.client.onInitPlayerEvent(init(id));
  t.client.onRoomListEvent(roomList(LOBBY(), roomInfo('voice', ['VoiceChat', 'TextChat']), GAME()));
  t.client.onJoinRoomResultEvent(joined(LOBBY()));
  t.events.length = 0;
  return t;
}

describe('WsClient rooms and players', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('knows no rooms until the server lists them, and requests the list on session init', () => {
    const { client, listRequests } = newClient();
    expect(client.roomManager.getAllRooms()).toEqual([]);

    client.onInitPlayerEvent(init(5));
    expect(listRequests).toHaveBeenCalledOnce();

    client.onRoomListEvent(roomList(LOBBY(), GAME()));
    const rooms = client.roomManager.getAllRooms();
    expect(rooms.map(r => r.id)).toEqual(['lobby', 'game']);
    expect(rooms[1].supportsMode(CommunicationMode.Spatial)).toBe(true);
    expect(rooms[0].userCount).toBe(1);
    expect(rooms[0].isPersistent).toBe(true);
  });

  it('a later room list replaces the set (removed rooms disappear, order follows the server)', () => {
    const { client, events } = inLobby();
    client.onRoomListEvent(roomList(GAME(), LOBBY()));
    expect(client.roomManager.getAllRooms().map(r => r.id)).toEqual(['game', 'lobby']);
    expect(events).toContain('list:game,lobby');
    // Our membership survives a list refresh.
    expect(client.getCurrentRoom()?.id).toBe('lobby');
  });

  it('the first confirmed join of a session is the home room', () => {
    const { client } = inLobby();
    expect(client.homeRoomId).toBe('lobby');
    expect(client.getCurrentRoom()?.id).toBe('lobby');
    expect(client.isInSpatialRoom).toBe(false);
  });

  it('joinRoom only sends a request; membership changes on confirmation', () => {
    const { client, joins, events } = inLobby();

    client.joinRoom('game');
    expect(joins).toHaveBeenCalledWith('game');
    expect(client.pendingRoomId).toBe('game');
    expect(client.getCurrentRoom()?.id).toBe('lobby');
    expect(client.isInSpatialRoom).toBe(false);

    client.onJoinRoomResultEvent(joined(GAME()));
    expect(client.pendingRoomId).toBeNull();
    expect(client.getCurrentRoom()?.id).toBe('game');
    expect(client.isInSpatialRoom).toBe(true);
    expect(client.shouldReceiveSpatialUpdates()).toBe(true);
    expect(events).toEqual(['joined:game']);
  });

  it('a refused join leaves membership unchanged and reports the reason', () => {
    const { client, events } = inLobby();
    client.joinRoom('nope');
    client.onJoinRoomResultEvent(refused('nope', 'Room not found'));

    expect(client.getCurrentRoom()?.id).toBe('lobby');
    expect(client.pendingRoomId).toBeNull();
    expect(events).toEqual(['failed:nope:Room not found']);
  });

  it('the lobby has no players; entering the game builds them and sets myPlayer', () => {
    const { client, events } = inLobby(5);
    expect(client.players).toEqual({});

    client.onJoinRoomResultEvent(joined(GAME()));
    client.onGameStateUpdateEvent(gameState(1, 2, 5));

    expect(Object.keys(client.players).map(Number)).toEqual([1, 2, 5]);
    expect(client.myPlayer?.id).toBe(5);
    expect(events).toEqual(['joined:game', 'create:1', 'create:2', 'create:5']);
  });

  it('leaving the game drops every player (with playerRemove for each view)', () => {
    const { client, events } = inLobby(5);
    client.onJoinRoomResultEvent(joined(GAME()));
    client.onGameStateUpdateEvent(gameState(1, 5));
    events.length = 0;

    client.onJoinRoomResultEvent(joined(LOBBY()));

    expect(client.players).toEqual({});
    expect(client.myPlayer).toBeNull();
    expect(client.playersCount).toBe(0);
    expect(client.isInSpatialRoom).toBe(false);
    expect(events).toEqual(['remove:1', 'remove:5', 'joined:lobby']);
  });

  it('game → lobby → game leaves no stale or duplicate players and re-sets myPlayer', () => {
    const { client, events } = inLobby(5);
    client.onJoinRoomResultEvent(joined(GAME()));
    client.onGameStateUpdateEvent(gameState(1, 2, 5));
    client.onJoinRoomResultEvent(joined(LOBBY()));
    events.length = 0;

    client.onJoinRoomResultEvent(joined(GAME()));
    client.onGameStateUpdateEvent(gameState(2, 5, 9)); // 1 left meanwhile, 9 joined

    expect(Object.keys(client.players).map(Number)).toEqual([2, 5, 9]);
    expect(client.playersCount).toBe(3);
    expect(client.myPlayer?.id).toBe(5);
    expect(events).toEqual(['joined:game', 'create:2', 'create:5', 'create:9']);
  });

  it('ignores a tick still in flight after leaving the game', () => {
    const { client } = inLobby(5);
    client.onJoinRoomResultEvent(joined(GAME()));
    client.onGameStateUpdateEvent(gameState(5));
    const me = client.myPlayer!;
    client.onJoinRoomResultEvent(joined(LOBBY()));

    const tick = new GameTickUpdateEvent();
    const ms = new MovementStateData();
    ms.playerId = 5;
    ms.x = 123;
    tick.movementStates = [ms];
    client.onGameTickUpdateEvent(tick);

    expect(me.x).toBe(0);
    expect(client.players).toEqual({});
  });

  it('a reconnect resets players, membership and the home room until the server re-confirms', () => {
    const { client } = inLobby(5);
    client.onJoinRoomResultEvent(joined(GAME()));
    client.onGameStateUpdateEvent(gameState(1, 5));

    client.onInitPlayerEvent(init(42));

    expect(client.clientId).toBe(42);
    expect(client.players).toEqual({});
    expect(client.getCurrentRoom()).toBeUndefined();
    expect(client.homeRoomId).toBeNull();
    // Rooms stay known until the next list replaces them.
    expect(client.roomManager.getRoom('game')).toBeDefined();

    client.onJoinRoomResultEvent(joined(LOBBY()));
    expect(client.homeRoomId).toBe('lobby');
  });

  it('room user lists and renames resolve chat names without any player objects', () => {
    const { client } = inLobby(5);
    const chats: string[] = [];
    client.on('chat', (_roomId, entry) => chats.push(`${entry.name}: ${entry.text}`));

    const users = new RoomUsersUpdateEvent();
    users.roomId = 'lobby';
    users.users = [5, 7].map(id => {
      const u = new RoomUserInfo();
      u.clientId = id;
      u.name = `User${id}`;
      return u;
    });
    client.onRoomUsersUpdateEvent(users);
    expect(client.roomManager.getRoom('lobby')!.userCount).toBe(2);

    // A live message without a name (an older server): resolved from the room list.
    const chat = new ChatMessageEvent();
    chat.clientId = 7;
    chat.message = 'hi';
    chat.id = 1;
    client.onChatMessageEvent(chat);

    const rename = new SetPlayerNameEvent();
    rename.clientId = 7;
    rename.name = 'Bob';
    client.onSetPlayerNameEvent(rename);
    chat.id = 2;
    client.onChatMessageEvent(chat);

    expect(chats).toEqual(['User7: hi', 'Bob: hi']);
    expect(client.getCurrentRoom()!.getClient(7)!.name).toBe('Bob');
  });
});

// ---- chat history + presence ----

function historyPage(
  roomId: string,
  ids: number[],
  opts: { reset?: boolean; hasMore?: boolean; beforeId?: number; epoch?: number } = {}
): ChatHistoryEvent {
  const e = new ChatHistoryEvent();
  e.roomId = roomId;
  e.epoch = opts.epoch ?? 1;
  e.reset = opts.reset ?? false;
  e.hasMore = opts.hasMore ?? false;
  e.beforeId = opts.beforeId ?? 0;
  e.messages = ids.map(id => {
    const m = new ChatMessageData();
    m.id = id;
    m.userId = 9;
    m.name = 'Ann';
    m.text = `m${id}`;
    m.sentAtMs = 1000 + id;
    return m;
  });
  return e;
}

function live(id: number, text = `m${id}`): ChatMessageEvent {
  const e = new ChatMessageEvent();
  e.id = id;
  e.clientId = 7;
  e.userId = 9;
  e.name = 'Ann';
  e.message = text;
  e.sentAtMs = 1000 + id;
  return e;
}

describe('WsClient chat history', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const ids = (client: WsClient<Player>, roomId: string) =>
    client.getChatLog(roomId).entries.map(e => e.id);

  it('identifies with the user key on session init (the name rides along)', () => {
    const client = new WsClient<Player>();
    client.userKey = 'k'.repeat(32);
    client.myPlayerName = 'Ann';
    const identify = vi.spyOn(client, 'sendIdentifyRequest');
    const rename = vi.spyOn(client, 'sendSetPlayerNameRequest');

    client.onInitPlayerEvent(init(5));

    expect(identify).toHaveBeenCalledWith('k'.repeat(32), 'Ann');
    expect(rename).not.toHaveBeenCalled();
  });

  it('asks for the latest page on the first visit and only for what was missed afterwards', () => {
    const { client } = newClient();
    const requests = vi.spyOn(client, 'sendChatHistoryRequest');
    client.onInitPlayerEvent(init(5));
    client.onRoomListEvent(roomList(LOBBY(), GAME()));

    client.onJoinRoomResultEvent(joined(LOBBY()));
    expect(requests).toHaveBeenLastCalledWith(0, 0, 0); // nothing cached

    client.onChatHistoryEvent(historyPage('lobby', [10, 11, 12], { reset: true, hasMore: true }));
    client.onChatMessageEvent(live(13));
    expect(ids(client, 'lobby')).toEqual([10, 11, 12, 13]);

    // Away to the game and back: the cached log is still there, only the gap is asked for.
    client.onJoinRoomResultEvent(joined(GAME()));
    client.onJoinRoomResultEvent(joined(LOBBY()));
    expect(requests).toHaveBeenLastCalledWith(0, 13, 1);

    const changes: string[] = [];
    client.on('chatHistory', (roomId, change) =>
      changes.push(`${roomId}:${change.kind}:${'entries' in change ? change.entries.length : ''}`)
    );
    client.onChatHistoryEvent(historyPage('lobby', [14, 15]));
    expect(changes).toEqual(['lobby:append:2']);
    expect(ids(client, 'lobby')).toEqual([10, 11, 12, 13, 14, 15]);
  });

  it('a live message that also arrives in a history page is not duplicated', () => {
    const { client } = inLobby();
    const lives: number[] = [];
    client.on('chat', (_room, entry) => lives.push(entry.id));

    client.onChatMessageEvent(live(21));
    client.onChatHistoryEvent(historyPage('lobby', [20, 21], { reset: true }));
    client.onChatMessageEvent(live(21)); // replayed
    client.onChatMessageEvent(live(22));

    expect(lives).toEqual([21, 22]);
    expect(ids(client, 'lobby')).toEqual([20, 21, 22]);
  });

  it('chat logs are per room: a live message lands in the room we are in', () => {
    const { client } = inLobby();
    client.onChatMessageEvent(live(1));
    client.onJoinRoomResultEvent(joined(GAME()));
    client.onChatMessageEvent(live(2));

    expect(ids(client, 'lobby')).toEqual([1]);
    expect(ids(client, 'game')).toEqual([2]);
  });

  it('loads older pages one at a time, from the oldest cached message', () => {
    const { client } = inLobby();
    const requests = vi.spyOn(client, 'sendChatHistoryRequest');
    client.onChatHistoryEvent(historyPage('lobby', [50, 51], { reset: true, hasMore: true }));

    expect(client.loadOlderChat()).toBe(true);
    expect(requests).toHaveBeenLastCalledWith(50, 0, 1);
    expect(client.loadOlderChat()).toBe(false); // already loading

    client.onChatHistoryEvent(historyPage('lobby', [48, 49], { beforeId: 50, hasMore: false }));
    expect(ids(client, 'lobby')).toEqual([48, 49, 50, 51]);
    expect(client.loadOlderChat()).toBe(false); // nothing older
  });

  it('gives up on an unanswered older-page request so scrolling can retry', () => {
    vi.useFakeTimers();
    const { client } = inLobby();
    client.onChatHistoryEvent(historyPage('lobby', [50], { reset: true, hasMore: true }));
    const changes: string[] = [];
    client.on('chatHistory', (_room, change) => changes.push(change.kind));

    expect(client.loadOlderChat()).toBe(true);
    vi.advanceTimersByTime(WsClient.HISTORY_TIMEOUT_MS + 1);

    expect(changes).toEqual(['prepend']);
    expect(client.getChatLog('lobby').loadingOlder).toBe(false);
    expect(client.loadOlderChat()).toBe(true);
  });

  it('keeps the chat cache across a reconnect and catches up from the last known id', () => {
    const { client } = inLobby();
    const requests = vi.spyOn(client, 'sendChatHistoryRequest');
    client.onChatHistoryEvent(historyPage('lobby', [5, 6], { reset: true }));

    client.onInitPlayerEvent(init(77)); // reconnect: new clientId, new session
    client.onJoinRoomResultEvent(joined(LOBBY()));

    expect(ids(client, 'lobby')).toEqual([5, 6]);
    expect(requests).toHaveBeenLastCalledWith(0, 6, 1);
  });

  it('a different history epoch drops every cached room', () => {
    const { client } = inLobby();
    client.onChatHistoryEvent(historyPage('lobby', [5, 6], { reset: true }));
    client.onJoinRoomResultEvent(joined(GAME()));
    client.onChatHistoryEvent(historyPage('game', [7], { reset: true }));

    // The server restarted without its history: ids start over.
    client.onChatHistoryEvent(historyPage('game', [1], { reset: true, epoch: 2 }));

    expect(ids(client, 'game')).toEqual([1]);
    expect(ids(client, 'lobby')).toEqual([]);
    expect(client.chatLog.epoch).toBe(2);
  });
});

describe('WsClient presence', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  function user(userId: number, status: number, roomId: string | null = null): PresenceUserInfo {
    const u = new PresenceUserInfo();
    u.userId = userId;
    u.name = `U${userId}`;
    u.status = status;
    u.roomId = roomId;
    u.lastSeenMs = 5000;
    return u;
  }

  it('builds the member list from the snapshot and keeps offline users in it', () => {
    const { client } = inLobby();
    let notified = 0;
    client.on('presence', () => notified++);

    const snapshot = new PresenceSnapshotEvent();
    snapshot.yourUserId = 1;
    snapshot.users = [
      user(1, PresenceStatus.Online, 'lobby'),
      user(2, PresenceStatus.Online, 'lobby'),
    ];
    client.onPresenceSnapshotEvent(snapshot);
    expect(client.myUserId).toBe(1);

    const left = new PresenceUpdateEvent();
    left.user = user(2, PresenceStatus.Offline);
    client.onPresenceUpdateEvent(left);

    expect([...client.presence.values()].map(u => [u.userId, u.status, u.roomId])).toEqual([
      [1, PresenceStatus.Online, 'lobby'],
      [2, PresenceStatus.Offline, null],
    ]);
    expect(notified).toBe(2);
  });

  it('own messages are recognised by user id, across client ids', () => {
    const { client } = inLobby(5);
    const snapshot = new PresenceSnapshotEvent();
    snapshot.yourUserId = 9;
    client.onPresenceSnapshotEvent(snapshot);

    client.onChatHistoryEvent(historyPage('lobby', [1], { reset: true })); // written by user 9
    expect(client.isOwnMessage(client.getChatLog('lobby').entries[0])).toBe(true);
    expect(client.isOwnMessage({ id: 2, userId: 4, name: 'x', text: '', sentAtMs: 0 })).toBe(false);
    // Anonymous authors (user id 0) are never "us".
    expect(client.isOwnMessage({ id: 3, userId: 0, name: 'x', text: '', sentAtMs: 0 })).toBe(false);
  });

  it('reports away only on change and repeats it for a new session', () => {
    const { client } = inLobby();
    const away = vi.spyOn(client, 'sendSetAwayRequest');

    client.setAway(true);
    client.setAway(true);
    expect(away).toHaveBeenCalledTimes(1);

    client.onInitPlayerEvent(init(8)); // reconnect while still away
    expect(away).toHaveBeenCalledTimes(2);
    expect(away).toHaveBeenLastCalledWith(true);

    client.setAway(false);
    expect(away).toHaveBeenLastCalledWith(false);
  });

  it('room user lists carry the user id (0 = anonymous guest)', () => {
    const { client } = inLobby(5);
    const users = new RoomUsersUpdateEvent();
    users.roomId = 'lobby';
    users.users = [5, 7].map(id => {
      const u = new RoomUserInfo();
      u.clientId = id;
      u.name = `User${id}`;
      u.userId = id === 5 ? 42 : 0;
      return u;
    });
    client.onRoomUsersUpdateEvent(users);

    expect(client.getCurrentRoom()!.getClient(5)!.userId).toBe(42);
    expect(client.getCurrentRoom()!.getClient(7)!.userId).toBe(0);
  });
});

// ---- stage D: delta tick snapshots + interpolation input ----

function moved(id: number, x: number, y = 0, anim = 1): MovementStateData {
  const ms = new MovementStateData();
  ms.playerId = id;
  ms.x = x;
  ms.y = y;
  ms.animationState = anim;
  return ms;
}

function tick(serverTimeMs: number, ...states: MovementStateData[]): GameTickUpdateEvent {
  const e = new GameTickUpdateEvent();
  e.serverTimeMs = serverTimeMs;
  e.movementStates = states;
  e.destroyedBulletsIds = [];
  e.respawnedPlayerIds = [];
  e.hitPlayersState = [];
  return e;
}

describe('WsClient accounts and profiles', () => {
  beforeEach(() => vi.spyOn(console, 'log').mockImplementation(() => {}));
  afterEach(() => vi.restoreAllMocks());

  function result(action: AccountAction, success: boolean, login: string | null, error?: string) {
    const e = new AccountResultEvent();
    e.action = action;
    e.success = success;
    e.login = login;
    e.error = error ?? null;
    return e;
  }

  function snapshot(yourUserId: number, yourLogin: string | null, about = '', avatarVersion = 0) {
    const me = new PresenceUserInfo();
    me.userId = yourUserId;
    me.name = 'Ann';
    me.status = PresenceStatus.Online;
    me.about = about;
    me.avatarVersion = avatarVersion;
    const e = new PresenceSnapshotEvent();
    e.yourUserId = yourUserId;
    e.yourLogin = yourLogin;
    e.users = [me];
    return e;
  }

  it('a guest identifies with its key; the snapshot tells whether the account is claimed', () => {
    const client = new WsClient<Player>();
    client.userKey = 'guest-key-0123456789';
    const identify = vi.spyOn(client, 'sendIdentifyRequest');
    client.onInitPlayerEvent(init(5));
    expect(identify).toHaveBeenCalledWith('guest-key-0123456789', client.myPlayerName);

    client.onPresenceSnapshotEvent(snapshot(9, null));
    expect(client.myLogin).toBeNull();
    client.onPresenceSnapshotEvent(snapshot(9, 'ann'));
    expect(client.myLogin).toBe('ann');
  });

  it('claiming keeps the user and learns the login', () => {
    const client = new WsClient<Player>();
    client.onInitPlayerEvent(init(5));
    client.onPresenceSnapshotEvent(snapshot(9, null));
    const results: unknown[] = [];
    client.on('account', r => results.push(r));

    client.onAccountResultEvent(result(AccountAction.Claim, false, null, 'login_taken'));
    expect(client.myLogin).toBeNull();
    client.onAccountResultEvent(result(AccountAction.Claim, true, 'ann'));

    expect([client.myLogin, client.myUserId]).toEqual(['ann', 9]);
    expect(results).toEqual([
      { action: AccountAction.Claim, success: false, error: 'login_taken' },
      { action: AccountAction.Claim, success: true, error: null },
    ]);
  });

  it('logging in is sent instead of the identify, and adopts the new key only on success', () => {
    const client = new WsClient<Player>();
    const login = vi.spyOn(client, 'sendLoginRequest');
    const identify = vi.spyOn(client, 'sendIdentifyRequest');
    client.loginOnConnect('ann', 'secret-password', 'device-key-0123456789');

    client.onInitPlayerEvent(init(5));
    expect(login).toHaveBeenCalledWith('ann', 'secret-password', 'device-key-0123456789');
    expect(identify).not.toHaveBeenCalled();
    expect(client.userKey).toBe(''); // not ours until the server says so

    // A reconnect before the answer repeats the login.
    client.onInitPlayerEvent(init(6));
    expect(login).toHaveBeenCalledTimes(2);

    client.onAccountResultEvent(result(AccountAction.Login, true, 'ann'));
    expect([client.userKey, client.myLogin]).toEqual(['device-key-0123456789', 'ann']);

    // From now on this device identifies with its key; the password is gone.
    client.onInitPlayerEvent(init(7));
    expect(login).toHaveBeenCalledTimes(2);
    expect(identify).toHaveBeenCalledWith('device-key-0123456789', client.myPlayerName);
  });

  it('a refused login leaves the client anonymous and does not retry', () => {
    const client = new WsClient<Player>();
    const login = vi.spyOn(client, 'sendLoginRequest');
    client.loginOnConnect('ann', 'wrong', 'device-key-0123456789');
    client.onInitPlayerEvent(init(5));
    const errors: (string | null)[] = [];
    client.on('account', r => errors.push(r.error));

    client.onAccountResultEvent(result(AccountAction.Login, false, null, 'bad_credentials'));

    expect(errors).toEqual(['bad_credentials']);
    expect([client.userKey, client.myLogin]).toEqual(['', null]);
    client.onInitPlayerEvent(init(6));
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('logging out forgets the key and the user', () => {
    const client = new WsClient<Player>();
    client.userKey = 'device-key-0123456789';
    client.onInitPlayerEvent(init(5));
    client.onPresenceSnapshotEvent(snapshot(9, 'ann'));

    client.onAccountResultEvent(result(AccountAction.Logout, true, null));

    expect([client.userKey, client.myLogin, client.myUserId, client.me]).toEqual([
      '',
      null,
      0,
      undefined,
    ]);
  });

  it('exposes the profile and an immutable avatar url on the game server', () => {
    const client = new WsClient<Player>();
    client.overrideUrl = 'ws://localhost:5000/ws';
    client.onInitPlayerEvent(init(5));
    client.onPresenceSnapshotEvent(snapshot(9, null, 'hello', 0));
    expect(client.me?.about).toBe('hello');
    expect(client.avatarUrl(client.me)).toBeNull(); // no avatar

    const update = new PresenceUpdateEvent();
    update.user = snapshot(9, null, 'hello', 1700000000).users![0];
    client.onPresenceUpdateEvent(update);
    expect(client.avatarUrl(client.me)).toBe('http://localhost:5000/avatars/9?v=1700000000');

    client.overrideUrl = 'wss://play.example.com/ws';
    expect(client.avatarUrl(client.me)).toBe('https://play.example.com/avatars/9?v=1700000000');
    expect(client.avatarUrl(undefined)).toBeNull();
  });

  it('an empty avatar upload is a removal', () => {
    const client = new WsClient<Player>();
    const send = vi.spyOn(client, 'sendSetAvatarRequest');
    client.setAvatar(null);
    expect(send.mock.calls[0][0]).toHaveLength(0);
  });
});

describe('WsClient delta tick snapshots', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  /** In the game with players 2 (remote) and 5 (us); local clock driven by `clock.ms`. */
  function inGame() {
    const t = inLobby(5);
    const clock = { ms: 10_000 };
    t.client.now = () => clock.ms;
    t.client.onJoinRoomResultEvent(joined(GAME()));
    t.client.onGameStateUpdateEvent(gameState(2, 5));
    return { ...t, clock, remote: t.client.players[2], me: t.client.players[5] };
  }

  it('applies the avatars in the snapshot and keeps the absent ones exactly where they were', () => {
    const { client, remote, me } = inGame();
    client.onGameTickUpdateEvent(tick(1000, moved(2, 10, 20), moved(5, 1, 1)));
    client.onGameTickUpdateEvent(tick(1066, moved(2, 20, 20))); // 5 unchanged → absent

    expect([remote.x, remote.y, remote.animationState]).toEqual([20, 20, 1]);
    expect([me.x, me.y]).toEqual([1, 1]); // not dropped, not moved
    expect(client.players[5]).toBe(me);

    me.updateRender(1066);
    expect([me.renderX, me.renderY, me.getVelocity()]).toEqual([1, 1, 0]);
    remote.updateRender(1033);
    expect(remote.renderX).toBeCloseTo(15);
    expect(remote.speed.x).toBeCloseTo(10 / 0.066, 0);
  });

  it('a player idle for a long time (absent from deltas) starts with a walk, not a slide', () => {
    const { client, remote } = inGame();
    client.onGameTickUpdateEvent(tick(1000, moved(2, 0, 0, 0)));
    let t = 1000;
    while (t < 9000) client.onGameTickUpdateEvent(tick((t += 66))); // empty deltas
    client.onGameTickUpdateEvent(tick(t + 66, moved(2, 17, 0)));

    // Halfway between the last empty delta and the first step: half a step, not ~all of
    // it (which interpolating across the whole 8 s idle gap would give).
    remote.updateRender(t + 33);
    expect(remote.renderX).toBeCloseTo(8.5, 5);
  });

  it('velocity reaches zero once the stopped state arrives, and stays zero after the avatar drops out', () => {
    const { client, remote } = inGame();
    client.onGameTickUpdateEvent(tick(1000, moved(2, 0)));
    client.onGameTickUpdateEvent(tick(1066, moved(2, 17)));
    client.onGameTickUpdateEvent(tick(1133, moved(2, 30, 0, 0))); // stopped (sent 3x)
    client.onGameTickUpdateEvent(tick(1200, moved(2, 30, 0, 0)));
    client.onGameTickUpdateEvent(tick(1266, moved(2, 30, 0, 0)));
    client.onGameTickUpdateEvent(tick(1333)); // dropped out of the deltas
    client.onGameTickUpdateEvent(tick(1400));

    remote.updateRender(1100);
    expect(remote.getVelocity()).toBeGreaterThan(10); // running
    remote.updateRender(1250);
    expect(remote.getVelocity()).toBe(0);
    expect(remote.renderX).toBe(30);
    remote.updateRender(5000); // long after the last snapshot
    expect([remote.renderX, remote.getVelocity()]).toEqual([30, 0]);
  });

  it('feeds the server clock from snapshot stamps and resets it with the session', () => {
    const { client, clock } = inGame();
    expect(client.serverClock.synced).toBe(false);
    client.onGameTickUpdateEvent(tick(1000));
    expect(client.serverClock.now(clock.ms)).toBe(1000);

    client.onInitPlayerEvent(init(42));
    expect(client.serverClock.synced).toBe(false);
  });

  it('a full player state (join) restarts that player’s interpolation history', () => {
    const { client, remote } = inGame();
    client.onGameTickUpdateEvent(tick(1000, moved(2, 0)));
    client.onGameTickUpdateEvent(tick(1066, moved(2, 17)));
    const pd = playerData(2);
    pd.movementState!.x = 100;
    client.onPlayerJoinedEvent(Object.assign(new PlayerJoinedEvent(), { playerStateData: pd }));
    remote.updateRender(1033);
    expect(remote.renderX).toBe(100);
  });
});
