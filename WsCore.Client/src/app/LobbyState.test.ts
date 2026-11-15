import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WsClient from '../network/WsClient';
import Player from '../game/Player';
import { RoomInfo } from '../network/protocol/RoomInfo';
import { RoomListEvent } from '../network/protocol/RoomListEvent';
import { JoinRoomResultEvent } from '../network/protocol/JoinRoomResultEvent';
import { InitPlayerEvent } from '../network/protocol/InitPlayerEvent';
import { ChatHistoryEvent } from '../network/protocol/ChatHistoryEvent';
import { ChatMessageData } from '../network/protocol/ChatMessageData';
import { ChatMessageEvent } from '../network/protocol/ChatMessageEvent';
import { PresenceSnapshotEvent } from '../network/protocol/PresenceSnapshotEvent';
import { PresenceUpdateEvent } from '../network/protocol/PresenceUpdateEvent';
import { PresenceUserInfo } from '../network/protocol/PresenceUserInfo';
import { RoomUsersUpdateEvent } from '../network/protocol/RoomUsersUpdateEvent';
import { RoomUserInfo } from '../network/protocol/RoomUserInfo';

// LobbyState drives the (DOM-only) LobbyUI from client events. The UI is replaced by
// a recorder so the lobby's room flow can be checked without a DOM.

const ui = {
  calls: [] as string[],
  rooms: [] as { id: string; playable: boolean; userCount: number }[],
  current: null as string | null,
  messages: [] as { id: number; own: boolean }[],
  hasMore: false,
  loading: false,
  members: [] as { name: string; status: string; isSelf: boolean; detail?: string }[],
};

vi.mock('../lobby/LobbyUI', () => ({
  default: class {
    setOnMessageCallback() {}
    setOnRoomJoinCallback(cb: (id: string) => void) {
      (ui as any).join = cb;
    }
    setOnPlayCallback(cb: (id: string) => void) {
      (ui as any).play = cb;
    }
    setRooms(rooms: typeof ui.rooms) {
      ui.rooms = rooms;
    }
    setCurrentUserId() {}
    getCurrentRoomId() {
      return ui.current;
    }
    setCurrentRoom(id: string) {
      ui.current = id;
      ui.calls.push(`current:${id}`);
    }
    setPendingRoom(id: string | null) {
      ui.calls.push(`pending:${id}`);
    }
    addSystemMessage(text: string) {
      ui.calls.push(`system:${text}`);
    }
    refreshMessageAvatars() {}
    setOnProfileCallback(cb: () => void) {
      (ui as any).profile = cb;
    }
    setOnLoadOlderCallback(cb: () => void) {
      (ui as any).loadOlder = cb;
    }
    setMessages(messages: typeof ui.messages, hasMore: boolean) {
      ui.messages = [...messages];
      ui.hasMore = hasMore;
      ui.loading = false;
      ui.calls.push(`setMessages:${messages.length}`);
    }
    appendMessages(messages: typeof ui.messages) {
      ui.messages.push(...messages);
      ui.calls.push(`append:${messages.length}`);
    }
    prependMessages(messages: typeof ui.messages, hasMore: boolean) {
      ui.messages.unshift(...messages);
      ui.hasMore = hasMore;
      ui.loading = false;
      ui.calls.push(`prepend:${messages.length}`);
    }
    setHistoryState(hasMore: boolean, loading: boolean) {
      ui.hasMore = hasMore;
      ui.loading = loading;
    }
    setMembers(members: typeof ui.members) {
      ui.members = members;
    }
    destroy() {}
  },
}));

function room(id: string, modes: string[]): RoomInfo {
  const r = new RoomInfo();
  r.id = id;
  r.name = id;
  r.supportedModes = modes;
  return r;
}
const LOBBY = () => room('lobby', ['TextChat']);
const VOICE = () => room('voice', ['VoiceChat', 'TextChat']);
const GAME = () => room('game', ['Spatial', 'TextChat']);

function result(r: RoomInfo | string, success = true, error = ''): JoinRoomResultEvent {
  const e = new JoinRoomResultEvent();
  e.roomId = typeof r === 'string' ? r : r.id;
  e.success = success;
  e.error = error || null;
  e.room = typeof r === 'string' ? null : r;
  return e;
}

async function setup() {
  const { default: LobbyState } = await import('./LobbyState');
  const client = new WsClient<Player>();
  client.playerFactory = id => new Player(id);
  const joins = vi.spyOn(client, 'sendJoinRoomRequest');
  const played: string[] = [];
  const state = new LobbyState(client, id => played.push(id));
  return { client, joins, played, state };
}

function init(client: WsClient<Player>, id: number): void {
  const e = new InitPlayerEvent();
  e.clientId = id;
  client.onInitPlayerEvent(e);
}

describe('LobbyState room flow', () => {
  beforeEach(() => {
    ui.calls = [];
    ui.rooms = [];
    ui.current = null;
    ui.messages = [];
    ui.hasMore = false;
    ui.loading = false;
    ui.members = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it('first connect: shows the room the server put us in, without sending a join', async () => {
    const { client, joins, state } = await setup();
    state.enter();
    client.on('sessionInit', () => state.onSessionInit());

    init(client, 3);
    const list = new RoomListEvent();
    list.rooms = [LOBBY(), VOICE(), GAME()];
    client.onRoomListEvent(list);
    client.onJoinRoomResultEvent(result(LOBBY()));

    expect(joins).not.toHaveBeenCalled();
    expect(ui.current).toBe('lobby');
    expect(ui.rooms.map(r => [r.id, r.playable])).toEqual([
      ['lobby', false],
      ['voice', false],
      ['game', true],
    ]);
  });

  it('switching rooms is pending until confirmed; a refusal keeps the room and says why', async () => {
    const { client, joins, state } = await setup();
    state.enter();
    init(client, 3);
    client.onJoinRoomResultEvent(result(LOBBY()));
    ui.calls = [];

    (ui as any).join('voice');
    expect(joins).toHaveBeenCalledWith('voice');
    expect(ui.calls).toEqual(['pending:voice']);
    expect(ui.current).toBe('lobby');

    client.onJoinRoomResultEvent(result(VOICE()));
    expect(ui.current).toBe('voice');
    expect(ui.calls).toContain('setMessages:0'); // separate chats: nothing cached for voice yet

    ui.calls = [];
    (ui as any).join('gone');
    client.onJoinRoomResultEvent(result('gone', false, 'Room not found'));
    expect(ui.current).toBe('voice');
    expect(ui.calls).toEqual([
      'pending:gone',
      'pending:null',
      'system:Could not join gone: Room not found',
    ]);
  });

  it('Play / clicking a game room enters the game for that room', async () => {
    const { state, played } = await setup();
    state.enter();
    (ui as any).play('game');
    expect(played).toEqual(['game']);
  });

  it('back from the game: asks to return to the home room', async () => {
    const { client, joins, state } = await setup();
    init(client, 3);
    client.onJoinRoomResultEvent(result(LOBBY())); // home
    client.onJoinRoomResultEvent(result(GAME())); // in the game
    joins.mockClear();

    state.enter();
    state.onSessionInit();

    expect(joins).toHaveBeenCalledWith('lobby');
    expect(ui.calls).toContain('pending:lobby');
    client.onJoinRoomResultEvent(result(LOBBY()));
    expect(ui.current).toBe('lobby');
  });

  it('a game join landing after we left the game is undone', async () => {
    const { client, joins, state } = await setup();
    state.enter();
    init(client, 3);
    client.onJoinRoomResultEvent(result(LOBBY()));
    joins.mockClear();

    client.onJoinRoomResultEvent(result(GAME()));

    expect(joins).toHaveBeenCalledWith('lobby');
    expect(ui.current).toBe('lobby');
  });
});

// ---- chat history + member list ----

function historyPage(
  roomId: string,
  ids: number[],
  opts: { reset?: boolean; hasMore?: boolean; beforeId?: number } = {}
): ChatHistoryEvent {
  const e = new ChatHistoryEvent();
  e.roomId = roomId;
  e.epoch = 1;
  e.reset = opts.reset ?? false;
  e.hasMore = opts.hasMore ?? false;
  e.beforeId = opts.beforeId ?? 0;
  e.messages = ids.map(id => {
    const m = new ChatMessageData();
    m.id = id;
    m.userId = id % 2 ? 1 : 2; // odd ids are ours (user 1)
    m.name = 'x';
    m.text = `m${id}`;
    m.sentAtMs = id;
    return m;
  });
  return e;
}

function presence(userId: number, status: number, roomId: string | null, lastSeenMs = 0) {
  const u = new PresenceUserInfo();
  u.userId = userId;
  u.name = `U${userId}`;
  u.status = status;
  u.roomId = roomId;
  u.lastSeenMs = lastSeenMs;
  return u;
}

describe('LobbyState chat history and members', () => {
  beforeEach(() => {
    ui.calls = [];
    ui.rooms = [];
    ui.current = null;
    ui.messages = [];
    ui.hasMore = false;
    ui.loading = false;
    ui.members = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  async function inLobby() {
    const t = await setup();
    t.state.enter();
    t.client.on('sessionInit', () => t.state.onSessionInit());
    init(t.client, 3);
    const list = new RoomListEvent();
    list.rooms = [LOBBY(), VOICE(), GAME()];
    t.client.onRoomListEvent(list);
    const snapshot = new PresenceSnapshotEvent();
    snapshot.yourUserId = 1;
    snapshot.users = [presence(1, 1, 'lobby')];
    t.client.onPresenceSnapshotEvent(snapshot);
    t.client.onJoinRoomResultEvent(result(LOBBY()));
    ui.calls = [];
    return t;
  }

  it('renders the latest page, then live messages and older pages incrementally', async () => {
    const { client } = await inLobby();
    const older = vi.spyOn(client, 'sendChatHistoryRequest');

    client.onChatHistoryEvent(historyPage('lobby', [10, 11], { reset: true, hasMore: true }));
    expect(ui.calls).toEqual(['setMessages:2']);
    expect(ui.messages.map(m => [m.id, m.own])).toEqual([
      [10, false],
      [11, true],
    ]);
    expect(ui.hasMore).toBe(true);

    const live = new ChatMessageEvent();
    live.id = 12;
    live.userId = 2;
    live.message = 'hi';
    client.onChatMessageEvent(live);
    expect(ui.calls).toEqual(['setMessages:2', 'append:1']);

    // The user scrolls to the top: one request, the UI shows the loader until the page lands.
    (ui as any).loadOlder();
    (ui as any).loadOlder();
    expect(older).toHaveBeenCalledTimes(1);
    expect(older).toHaveBeenCalledWith(10, 0, 1);
    expect(ui.loading).toBe(true);

    client.onChatHistoryEvent(historyPage('lobby', [8, 9], { beforeId: 10 }));
    expect(ui.messages.map(m => m.id)).toEqual([8, 9, 10, 11, 12]);
    expect(ui.loading).toBe(false);
    expect(ui.hasMore).toBe(false);
  });

  it('coming back to a room shows its cached messages at once, then appends the gap', async () => {
    const { client } = await inLobby();
    client.onChatHistoryEvent(historyPage('lobby', [10, 11], { reset: true }));

    (ui as any).join('voice');
    client.onJoinRoomResultEvent(result(VOICE()));
    expect(ui.messages).toEqual([]);

    ui.calls = [];
    (ui as any).join('lobby');
    client.onJoinRoomResultEvent(result(LOBBY()));
    expect(ui.calls).toContain('setMessages:2'); // from the cache, before any server answer

    client.onChatHistoryEvent(historyPage('lobby', [12]));
    expect(ui.messages.map(m => m.id)).toEqual([10, 11, 12]);
  });

  it('history of a room we are not looking at is cached, not rendered', async () => {
    const { client } = await inLobby();
    client.onChatHistoryEvent(historyPage('voice', [1, 2], { reset: true }));
    expect(ui.calls).toEqual([]);
    expect(client.getChatLog('voice').entries.length).toBe(2);
  });

  it('members: online first (self on top), then away, then offline — nobody is dropped', async () => {
    const { client } = await inLobby();
    const now = Date.now();

    for (const u of [
      presence(4, 0, null, now - 3 * 3600_000), // offline for 3 h
      presence(5, 0, null, now - 5 * 60_000), // offline for 5 min
      presence(3, 2, 'lobby'), // away, here
      presence(2, 1, 'game'), // online, in the game
    ]) {
      const update = new PresenceUpdateEvent();
      update.user = u;
      client.onPresenceUpdateEvent(update);
    }

    expect(ui.members.map(m => [m.name, m.status, m.detail])).toEqual([
      ['U1', 'online', undefined],
      ['U2', 'online', 'game'],
      ['U3', 'away', 'Отошёл'],
      ['U5', 'offline', 'был(а) 5 мин назад'],
      ['U4', 'offline', 'был(а) 3 ч назад'],
    ]);
    expect(ui.members[0].isSelf).toBe(true);

    // U2 disconnects: still listed, now offline.
    const left = new PresenceUpdateEvent();
    left.user = presence(2, 0, null, now);
    client.onPresenceUpdateEvent(left);
    expect(ui.members.find(m => m.name === 'U2')!.status).toBe('offline');
    expect(ui.members.length).toBe(5);
  });

  it('anonymous connections in the room are listed as online guests', async () => {
    const { client } = await inLobby();
    const users = new RoomUsersUpdateEvent();
    users.roomId = 'lobby';
    users.users = [
      { clientId: 3, name: 'Me', userId: 1 },
      { clientId: 8, name: 'Console', userId: 0 },
      // Just connected: its identify (or rename) has not been processed yet.
      { clientId: 9, name: 'Player 9', userId: 0 },
    ].map(v => Object.assign(new RoomUserInfo(), v));
    client.onRoomUsersUpdateEvent(users);

    // The named guest is listed; the still-unnamed connection is not (it would flash
    // in the list and vanish as soon as it identifies).
    expect(ui.members.map(m => [m.name, m.status, m.isSelf])).toEqual([
      ['U1', 'online', true],
      ['Console', 'online', false],
    ]);
  });
});
