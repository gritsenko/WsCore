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
import { ChannelPermissionsEvent } from '../network/protocol/ChannelPermissionsEvent';
import { ChannelPermissionsInfo } from '../network/protocol/ChannelPermissionsInfo';
import { ChannelAdminInfo } from '../network/protocol/ChannelAdminInfo';
import { ChannelRestrictionInfo } from '../network/protocol/ChannelRestrictionInfo';
import { ChatMessageDeletedEvent } from '../network/protocol/ChatMessageDeletedEvent';
import { VoiceRosterEvent } from '../network/protocol/VoiceRosterEvent';
import { VoiceRoomInfo } from '../network/protocol/VoiceRoomInfo';
import { VoiceParticipantInfo } from '../network/protocol/VoiceParticipantInfo';
import { GameCatalogEvent } from '../network/protocol/GameCatalogEvent';
import { GameInfo } from '../network/protocol/GameInfo';
import { LeaderboardError } from '../portal/JamBridge';

// LobbyState drives the (DOM-only) LobbyUI from client events. The UI is replaced by
// a recorder so the lobby's room flow can be checked without a DOM.

const ui = {
  calls: [] as string[],
  rooms: [] as {
    id: string;
    playable: boolean;
    userCount: number;
    isPrivate?: boolean;
    isVoice?: boolean;
    voice?: { clientId: number; name: string; isSelf: boolean; muted: boolean }[];
  }[],
  voice: null as { status: string; roomName: string | null; error: string | null } | null,
  voiceRoomId: null as string | null,
  current: null as string | null,
  messages: [] as {
    id: number;
    own: boolean;
    login?: string | null;
    role?: string | null;
    canDelete?: boolean;
  }[],
  canManage: false,
  canCreate: false,
  blocked: null as string | null,
  gamesNav: null as { visible: boolean; count: number; active: boolean } | null,
  portal: null as unknown,
  stage: null as unknown,
  anonymous: false,
  hasMore: false,
  loading: false,
  members: [] as {
    name: string;
    status: string;
    isSelf: boolean;
    detail?: string;
    login?: string | null;
    role?: string | null;
    manageable?: boolean;
    restriction?: string | null;
  }[],
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
    refreshMessages(
      resolve: (userId: number) => { login: string | null; role: string | null },
      canDelete: (userId: number) => boolean
    ) {
      ui.messages = ui.messages.map(m => {
        const userId = (m as any).userId as number;
        const author = resolve(userId);
        return { ...m, login: author.login, role: author.role, canDelete: canDelete(userId) };
      });
    }
    setOnDeleteMessageCallback(cb: (id: number) => void) {
      (ui as any).delete = cb;
    }
    setOnManageChannelCallback() {}
    setOnManageMemberCallback() {}
    setOnCreateChannelCallback() {}
    setOnVoiceJoinCallback(cb: (id: string) => void) {
      (ui as any).voiceJoin = cb;
    }
    setOnVoiceControlCallback(cb: (control: string) => void) {
      (ui as any).voiceControl = cb;
    }
    setVoice(view: typeof ui.voice, roomId: string | null) {
      ui.voice = view;
      ui.voiceRoomId = roomId;
    }
    setVoiceSpeaking() {}
    setCanCreateChannel(can: boolean) {
      ui.canCreate = can;
    }
    setCanManageChannel(can: boolean) {
      ui.canManage = can;
    }
    setComposerBlocked(reason: string | null) {
      ui.blocked = reason;
    }
    removeMessage(id: number) {
      ui.messages = ui.messages.filter(m => m.id !== id);
      ui.calls.push(`remove:${id}`);
    }
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
    setOnGamesCallback(cb: () => void) {
      (ui as any).games = cb;
    }
    setGamesNav(visible: boolean, count: number, active: boolean) {
      ui.gamesNav = { visible, count, active };
    }
    setPortal(page: unknown) {
      ui.portal = page;
    }
    setGameStage(stage: unknown) {
      ui.stage = stage;
    }
    togglePlayingChat() {}
    setAnonymous(anonymous: boolean) {
      ui.anonymous = anonymous;
    }
    destroy() {}
  },
}));

// The portal's DOM pieces are recorded too.
const hosts: {
  game: { id: string; playUrl: string };
  options: {
    onLeave(): void;
    onRestart?(): void;
    play?: { sendBeat(ms: number, ended: boolean): void };
    leaderboard?: (op: string, board: string, args: Record<string, unknown>) => Promise<unknown>;
  };
  notices: string[];
  destroyed: boolean;
  updateAvailable: boolean;
}[] = [];
const pages: { shown: [string, unknown][] }[] = [];

vi.mock('../portal/GameHost', () => ({
  default: class {
    element = { stage: true };
    destroyed = false;
    updateAvailable = false;
    notices: string[] = [];
    showNotice(text: string) {
      this.notices.push(text);
    }
    constructor(
      public game: unknown,
      public options: unknown
    ) {
      hosts.push(this as any);
    }
    setUpdateAvailable(available: boolean) {
      this.updateAvailable = available;
    }
    destroy() {
      this.destroyed = true;
    }
  },
}));

vi.mock('../portal/PortalUI', () => ({
  default: class {
    element = { portal: true };
    shown: [string, unknown][] = [];
    constructor(public callbacks: unknown) {
      pages.push(this as any);
    }
    showCatalog(cards: unknown) {
      this.shown.push(['catalog', cards]);
    }
    showGame(card: unknown, boards: unknown = null) {
      this.shown.push(['game', card, boards] as any);
    }
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
    ui.canManage = false;
    ui.canCreate = false;
    ui.blocked = null;
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
    ui.canManage = false;
    ui.blocked = null;
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

  function permissions(
    roomId: string,
    opts: {
      defaults?: number;
      admins?: [number, number, string][];
      restrictions?: [number, number, boolean, number][];
    }
  ): ChannelPermissionsEvent {
    const info = new ChannelPermissionsInfo();
    info.roomId = roomId;
    info.defaultPermissions = opts.defaults ?? 3;
    info.admins = (opts.admins ?? []).map(([userId, rights, title]) =>
      Object.assign(new ChannelAdminInfo(), { userId, rights, title })
    );
    info.restrictions = (opts.restrictions ?? []).map(([userId, denied, banned, untilMs]) =>
      Object.assign(new ChannelRestrictionInfo(), { userId, denied, banned, untilMs })
    );
    const e = new ChannelPermissionsEvent();
    e.channels = [info];
    return e;
  }

  it('roles: @login and the channel role on members and messages, refreshed as they change', async () => {
    const { client } = await inLobby();
    const author = presence(2, 1, 'lobby');
    author.login = 'bob';
    const update = new PresenceUpdateEvent();
    update.user = author;
    client.onPresenceUpdateEvent(update);
    client.onChatHistoryEvent(historyPage('lobby', [10], { reset: true }));
    (ui.messages[0] as any).userId = 2;

    client.onChannelPermissionsEvent(permissions('lobby', { admins: [[2, 1, 'модератор']] }));
    expect(ui.members.find(m => m.name === 'U2')).toMatchObject({
      login: 'bob',
      role: 'модератор',
    });
    expect(ui.messages[0]).toMatchObject({ login: 'bob', role: 'модератор', canDelete: false });

    // Demoted: the badge goes away everywhere.
    client.onChannelPermissionsEvent(permissions('lobby', {}));
    expect(ui.members.find(m => m.name === 'U2')!.role).toBeNull();
    expect(ui.messages[0].role).toBeNull();
  });

  it('a channel admin gets the management button, can delete and manage others', async () => {
    const { client } = await inLobby();
    expect(ui.canManage).toBe(false);

    client.onChannelPermissionsEvent(permissions('lobby', { admins: [[1, 1 | 2, '']] }));
    expect(ui.canManage).toBe(true);
    expect(ui.members.find(m => m.isSelf)!.role).toBe('админ');

    const deletes = vi.spyOn(client, 'sendDeleteChatMessageRequest');
    vi.stubGlobal('window', { confirm: () => true }); // no DOM here
    try {
      (ui as any).delete(10);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(deletes).toHaveBeenCalledWith('lobby', 10);

    // Not in this channel: the lobby admin has no say in the voice room.
    (ui as any).join('voice');
    client.onJoinRoomResultEvent(result(VOICE()));
    expect(ui.canManage).toBe(false);
  });

  it('a muted member gets a blocked composer; a deleted message disappears', async () => {
    const { client } = await inLobby();
    client.onChatHistoryEvent(historyPage('lobby', [10, 11], { reset: true }));

    client.onChannelPermissionsEvent(permissions('lobby', { restrictions: [[1, 1, false, 0]] }));
    expect(ui.blocked).toMatch(/запрещено писать/);

    client.onChannelPermissionsEvent(permissions('lobby', {}));
    expect(ui.blocked).toBeNull();

    const deleted = new ChatMessageDeletedEvent();
    deleted.roomId = 'lobby';
    deleted.messageId = 10;
    client.onChatMessageDeletedEvent(deleted);
    expect(ui.messages.map(m => m.id)).toEqual([11]);
    expect(client.getChatLog('lobby').entries.map(e => e.id)).toEqual([11]);
  });

  it('a refused chat message is explained in the chat', async () => {
    const { client } = await inLobby();
    const { ModerationResultEvent } = await import('../network/protocol/ModerationResultEvent');
    const refused = new ModerationResultEvent();
    refused.action = 6;
    refused.success = false;
    refused.error = 'links_forbidden';
    client.onModerationResultEvent(refused);
    expect(ui.calls).toContain('system:В этом канале нельзя отправлять ссылки');
  });

  it('a server admin may create channels; a private one is marked and entered once created', async () => {
    const { client } = await inLobby();
    expect(ui.canCreate).toBe(false);

    const admin = presence(1, 1, 'lobby');
    admin.isAdmin = true;
    const update = new PresenceUpdateEvent();
    update.user = admin;
    client.onPresenceUpdateEvent(update);
    expect(ui.canCreate).toBe(true);

    const secret = room('c1', ['TextChat']);
    secret.name = 'Штаб';
    secret.isPrivate = true;
    secret.isCreated = true;
    const list = new RoomListEvent();
    list.rooms = [LOBBY(), VOICE(), secret];
    client.onRoomListEvent(list);
    expect(ui.rooms.find(r => r.id === 'c1')?.isPrivate).toBe(true);
    expect(client.roomManager.getRoom('c1')?.isCreated).toBe(true);

    const { ModerationResultEvent } = await import('../network/protocol/ModerationResultEvent');
    const created = new ModerationResultEvent();
    created.action = 7;
    created.success = true;
    created.roomId = 'c1';
    const joins = vi.spyOn(client, 'joinRoom');
    client.onModerationResultEvent(created);
    expect(joins).toHaveBeenCalledWith('c1');

    // Refused entry to a private channel is explained.
    client.onJoinRoomResultEvent(result('c2', false, 'no_access'));
    expect(ui.calls.some(c => c.includes('нужен доступ'))).toBe(true);
  });

  it('voice channels list who talks there, and clicking one joins its voice', async () => {
    const t = await setup();
    const joined: string[] = [];
    const fakeVoice = {
      status: 'off',
      error: null as string | null,
      muted: false,
      deafened: false,
      roomId: null as string | null,
      speaking: new Set<number>(),
      on: () => () => {},
      join: (id: string) => {
        joined.push(id);
        return Promise.resolve();
      },
    };
    const { default: LobbyState } = await import('./LobbyState');
    const state = new LobbyState(t.client, () => {}, null, fakeVoice as any);
    state.enter();
    init(t.client, 3);
    const list = new RoomListEvent();
    list.rooms = [LOBBY(), VOICE()];
    t.client.onRoomListEvent(list);
    const snapshot = new PresenceSnapshotEvent();
    snapshot.yourUserId = 1;
    snapshot.users = [presence(1, 1, 'lobby'), presence(2, 1, 'lobby')];
    t.client.onPresenceSnapshotEvent(snapshot);

    expect(ui.rooms.find(r => r.id === 'voice')?.isVoice).toBe(true);
    expect(ui.rooms.find(r => r.id === 'lobby')?.isVoice).toBe(false);

    const roster = new VoiceRosterEvent();
    roster.reset = true;
    const voiceRoom = new VoiceRoomInfo();
    voiceRoom.roomId = 'voice';
    const other = new VoiceParticipantInfo();
    other.clientId = 9;
    other.userId = 2;
    other.muted = true;
    voiceRoom.participants = [other];
    roster.rooms = [voiceRoom];
    t.client.onVoiceRosterEvent(roster);
    expect(ui.rooms.find(r => r.id === 'voice')?.voice).toEqual([
      expect.objectContaining({ clientId: 9, name: 'U2', isSelf: false, muted: true }),
    ]);

    (ui as any).voiceJoin('voice');
    expect(joined).toEqual(['voice']);
  });
});

function gameInfo(id: string, slug: string, release = 1, isPublic = true): GameInfo {
  const g = new GameInfo();
  g.id = id;
  g.slug = slug;
  g.title = slug;
  g.tags = [];
  g.isPublic = isPublic;
  g.roomId = `g-${id}`;
  g.releaseNo = release;
  g.playUrl = release ? `https://play.test/g/${id}/r${release}/index.html` : '';
  return g;
}

function catalog(client: WsClient<Player>, ...games: GameInfo[]): void {
  const e = new GameCatalogEvent();
  e.games = games;
  client.onGameCatalogEvent(e);
}

function fakeNav(path = '/') {
  const nav = {
    current: path,
    pushed: [] as string[],
    pop: null as (() => void) | null,
    path: () => nav.current,
    push: (p: string) => {
      nav.current = p;
      nav.pushed.push(p);
    },
    replace: (p: string) => {
      nav.current = p;
    },
    onPop: (l: () => void) => {
      nav.pop = l;
      return () => (nav.pop = null);
    },
  };
  return nav;
}

describe('LobbyState games portal', () => {
  beforeEach(() => {
    ui.calls = [];
    ui.rooms = [];
    ui.current = null;
    ui.blocked = null;
    ui.gamesNav = null;
    ui.portal = null;
    ui.stage = null;
    ui.anonymous = false;
    hosts.length = 0;
    pages.length = 0;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  async function enterAt(path: string, userKey = 'key-0123456789abcdef') {
    const s = await setup();
    s.client.userKey = userKey;
    const nav = fakeNav(path);
    s.state.nav = nav;
    s.state.enter();
    s.client.on('sessionInit', () => s.state.onSessionInit());
    init(s.client, 3);
    s.client.onJoinRoomResultEvent(result(LOBBY()));
    return { ...s, nav };
  }

  it('reads portal pages from the address', async () => {
    const { routeFromPath, pathOf } = await import('./LobbyState');
    expect(routeFromPath('/games')).toEqual({ kind: 'catalog' });
    expect(routeFromPath('/games/')).toEqual({ kind: 'catalog' });
    expect(routeFromPath('/games/Block-Chpok')).toEqual({ kind: 'game', slug: 'block-chpok' });
    expect(routeFromPath('/')).toBeNull();
    expect(routeFromPath('/games/a/b')).toBeNull();
    expect(pathOf({ kind: 'game', slug: 'x' })).toBe('/games/x');
  });

  it('the Games entry appears with the catalog and opens it in place of the chat', async () => {
    const { client, nav } = await enterAt('/');
    expect(ui.gamesNav?.visible).toBe(false); // no catalog yet: the server may have no portal
    catalog(client, gameInfo('aaaaaaaaaa', 'chpok'), gameInfo('bbbbbbbbbb', 'draft', 0, false));
    expect(ui.gamesNav).toEqual({ visible: true, count: 1, active: false });
    expect(ui.portal).toBeNull();

    (ui as any).games();
    expect(nav.current).toBe('/games');
    expect(ui.portal).toEqual({ portal: true });
    expect(ui.gamesNav?.active).toBe(true);
    const [kind, cards] = pages[0].shown[pages[0].shown.length - 1];
    expect(kind).toBe('catalog');
    expect((cards as { game: { slug: string } }[]).map(c => c.game.slug)).toEqual([
      'chpok',
      'draft',
    ]);

    // A channel click closes the portal and leaves /games.
    (ui as any).join('voice');
    expect(ui.portal).toBeNull();
    expect(nav.current).toBe('/');
  });

  it('a shared game link opens its page once the catalog arrives', async () => {
    const { client } = await enterAt('/games/chpok');
    expect(pages[0].shown).toEqual([]); // nothing known yet: no "not found" flash
    catalog(client, gameInfo('aaaaaaaaaa', 'chpok'));
    expect(pages[0].shown[pages[0].shown.length - 1][0]).toBe('game');
    expect((pages[0].shown[pages[0].shown.length - 1][1] as { game: { id: string } }).game.id).toBe(
      'aaaaaaaaaa'
    );
  });

  it('playing = being in the game room: the game is on the stage until we leave the room', async () => {
    const { client, joins, nav } = await enterAt('/games/chpok');
    catalog(client, gameInfo('aaaaaaaaaa', 'chpok'));
    const onPlay = (pages[0] as any).callbacks.onPlay as (g: unknown) => void;

    onPlay(client.games[0]);
    expect(joins).toHaveBeenLastCalledWith('g-aaaaaaaaaa');
    expect(hosts).toHaveLength(0); // only once the server confirms

    client.onJoinRoomResultEvent(result(room('g-aaaaaaaaaa', ['TextChat'])));
    expect(hosts).toHaveLength(1);
    expect(ui.stage).toEqual({ stage: true });
    expect(ui.portal).toBeNull();
    expect(ui.current).toBe('g-aaaaaaaaaa');
    // The game's room is known for the header but is not a channel.
    expect(ui.rooms.find(r => r.id === 'g-aaaaaaaaaa')).toMatchObject({ hidden: true });

    // The room list (pushed on any membership change) does not lose the hidden room.
    const list = new RoomListEvent();
    list.rooms = [LOBBY(), VOICE()];
    client.onRoomListEvent(list);
    expect(client.getCurrentRoom()?.id).toBe('g-aaaaaaaaaa');

    // A new build: offered, not forced.
    catalog(client, gameInfo('aaaaaaaaaa', 'chpok', 2));
    expect(hosts[0].updateAvailable).toBe(true);
    hosts[0].options.onRestart!();
    expect(hosts).toHaveLength(2);
    expect(hosts[0].destroyed).toBe(true);
    expect(hosts[1].game.playUrl).toContain('/r2/');

    // Leave: back to the lobby room and the game's page.
    hosts[1].options.onLeave();
    expect(hosts[1].destroyed).toBe(true);
    expect(ui.stage).toBeNull();
    expect(joins).toHaveBeenLastCalledWith('lobby');
    expect(nav.current).toBe('/games/chpok');
    expect(ui.portal).toEqual({ portal: true });
  });

  it('a reconnect while playing gets back into the game room without restarting the game', async () => {
    const { client, joins } = await enterAt('/');
    catalog(client, gameInfo('aaaaaaaaaa', 'chpok'));
    client.joinRoom('g-aaaaaaaaaa');
    client.onJoinRoomResultEvent(result(room('g-aaaaaaaaaa', ['TextChat'])));
    expect(hosts).toHaveLength(1);

    init(client, 4); // new connection
    expect(joins).toHaveBeenLastCalledWith('g-aaaaaaaaaa');
    client.onJoinRoomResultEvent(result(LOBBY())); // the server's own lobby join comes first
    expect(hosts[0].destroyed).toBe(false);
    client.onJoinRoomResultEvent(result(room('g-aaaaaaaaaa', ['TextChat'])));
    expect(hosts).toHaveLength(1);
    expect(hosts[0].destroyed).toBe(false);
  });

  it('a game that became a draft meanwhile stops the game on reconnect', async () => {
    const { client } = await enterAt('/');
    catalog(client, gameInfo('aaaaaaaaaa', 'chpok'));
    client.joinRoom('g-aaaaaaaaaa');
    client.onJoinRoomResultEvent(result(room('g-aaaaaaaaaa', ['TextChat'])));
    init(client, 4);
    client.onJoinRoomResultEvent(result(LOBBY()));
    client.onJoinRoomResultEvent(result('g-aaaaaaaaaa', false, 'no_access'));
    expect(hosts[0].destroyed).toBe(true);
    expect(ui.stage).toBeNull();
  });

  it('reports page views with how they were reached, and launches with the same source', async () => {
    const { client } = await enterAt('/games/chpok', '');
    const views = vi.spyOn(client, 'sendGameViewRequest');
    const beats = vi.spyOn(client, 'sendGamePlayBeatRequest');

    // The address was opened directly; the view goes once the catalog says which game it is.
    catalog(client, gameInfo('aaaaaaaaaa', 'chpok'), gameInfo('bbbbbbbbbb', 'other'));
    expect(views).toHaveBeenCalledTimes(1);
    expect(views.mock.calls[0][0]).toBe('aaaaaaaaaa');
    expect(views.mock.calls[0][1]).toBe('link');
    expect(views.mock.calls[0][2]).toMatch(/^[0-9a-f]{48}$/); // an unnamed visitor's id
    catalog(client, gameInfo('aaaaaaaaaa', 'chpok'), gameInfo('bbbbbbbbbb', 'other')); // no second view
    expect(views).toHaveBeenCalledTimes(1);

    // Play: the session reports with that source.
    client.joinRoom('g-aaaaaaaaaa');
    client.onJoinRoomResultEvent(result(room('g-aaaaaaaaaa', ['TextChat'])));
    hosts[0].options.play!.sendBeat(0, false);
    expect(beats.mock.calls[0][0]).toMatchObject({
      gameId: 'aaaaaaaaaa',
      releaseNo: 1,
      activeMs: 0,
      source: 'link',
      ended: false,
    });
    expect(beats.mock.calls[0][0].sessionId).toMatch(/^[0-9a-f]{32}$/);

    // Leaving shows the page without counting a view; a card click does count, as "catalog".
    hosts[0].options.onLeave();
    expect(views).toHaveBeenCalledTimes(1);
    ((pages[0] as any).callbacks.onOpen as (slug: string) => void)('other');
    expect(views.mock.calls[1].slice(0, 2)).toEqual(['bbbbbbbbbb', 'catalog']);
  });

  it('an unnamed visitor may browse and play but not write; "enter" asks for a name', async () => {
    const s = await setup();
    const signIn = vi.fn();
    const { default: LobbyState } = await import('./LobbyState');
    const state = new LobbyState(s.client, () => {}, null, null, null, signIn);
    state.nav = fakeNav('/games');
    state.enter();
    init(s.client, 3);
    s.client.onJoinRoomResultEvent(result(LOBBY()));

    expect(ui.anonymous).toBe(true);
    expect(ui.blocked).toBe('Войдите, чтобы писать в чат');
    (ui as any).profile();
    expect(signIn).toHaveBeenCalledOnce();
  });
});

describe('LobbyState leaderboards', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    ui.calls = [];
    ui.current = null;
    hosts.length = 0;
    pages.length = 0;
    store.clear();
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
      removeItem: (k: string) => store.delete(k),
    };
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).sessionStorage;
  });

  async function playing(userKey: string) {
    const s = await setup();
    s.client.userKey = userKey;
    s.client.overrideUrl = 'ws://srv:5000/ws';
    s.state.nav = fakeNav('/');
    s.state.enter();
    init(s.client, 3);
    s.client.onJoinRoomResultEvent(result(LOBBY()));
    catalog(s.client, gameInfo('aaaaaaaaaa', 'chpok'));
    s.client.joinRoom('g-aaaaaaaaaa');
    s.client.onJoinRoomResultEvent(result(room('g-aaaaaaaaaa', ['TextChat'])));
    return s;
  }

  it("relays a game's calls as us, with avatars the game can load, and failures as errors", async () => {
    const { client } = await playing('key-0123456789abcdef');
    const calls = vi.spyOn(client, 'leaderboard');
    calls.mockResolvedValueOnce({
      ok: true,
      status: 200,
      error: '',
      result: {
        entries: [{ avatarUrl: '/avatars/1?v=2', player: { avatarUrl: '/avatars/1?v=2' } }],
      },
    });
    calls.mockResolvedValueOnce({ ok: false, status: 404, error: 'no such board', result: null });

    const lb = hosts[0].options.leaderboard!;
    const read = (await lb('entries', 'best', { top: 5, around: 1, includeUser: true })) as any;
    expect(calls).toHaveBeenCalledWith('aaaaaaaaaa', 'best', 'entries', {
      top: 5,
      around: 1,
      includeUser: true,
    });
    expect(read.entries[0].avatarUrl).toBe('http://srv:5000/avatars/1?v=2');
    expect(read.entries[0].player.avatarUrl).toBe('http://srv:5000/avatars/1?v=2');

    const failed = lb('description', 'none', {}).catch(e => e);
    const error = (await failed) as LeaderboardError;
    expect(error).toBeInstanceOf(LeaderboardError);
    expect(error.status).toBe(404);
  });

  it("an unnamed visitor's score waits for them to enter, and the game says how", async () => {
    const { client } = await playing('');
    const calls = vi.spyOn(client, 'leaderboard').mockResolvedValue({
      ok: true,
      status: 200,
      error: '',
      result: { ok: false, reason: 'not_signed_in' },
    });
    const lb = hosts[0].options.leaderboard!;
    await lb('score', 'best', { score: 120, extraData: null });
    await lb('score', 'best', { score: 80, extraData: null });
    expect(hosts[0].notices).toEqual(['Войдите, чтобы попасть в таблицу рекордов']); // once
    expect(JSON.parse(store.get('wscore.pendingScores')!)).toEqual({
      aaaaaaaaaa: {
        best: { max: { score: 120, extraData: '' }, min: { score: 80, extraData: '' } },
      },
    });

    // Entered (identified): the best goes to the board; the other end shortly after.
    vi.useFakeTimers();
    calls.mockClear();
    client.userKey = 'key-0123456789abcdef';
    const snap = new PresenceSnapshotEvent();
    snap.yourUserId = 5;
    snap.users = [];
    client.onPresenceSnapshotEvent(snap);
    expect(calls).toHaveBeenCalledWith('aaaaaaaaaa', 'best', 'score', {
      score: 120,
      extraData: '',
    });
    vi.advanceTimersByTime(1000);
    expect(calls).toHaveBeenCalledWith('aaaaaaaaaa', 'best', 'score', { score: 80, extraData: '' });
    expect(store.has('wscore.pendingScores')).toBe(false);
    vi.useRealTimers();
  });

  it("a game's page shows its boards, with settings for its people", async () => {
    const s = await setup();
    s.client.userKey = 'key-0123456789abcdef';
    s.state.nav = fakeNav('/games/chpok');
    const calls = vi.spyOn(s.client, 'leaderboard').mockResolvedValue({
      ok: true,
      status: 200,
      error: '',
      result: [
        {
          description: {
            name: 'best',
            titleText: 'Очки',
            entryCount: 1,
            description: { type: 'numeric' },
          },
          entries: [{ rank: 1, formattedScore: '10', name: 'Al' }],
          myRank: 0,
          myEntry: null,
          ownCount: 0,
        },
      ],
    });
    s.state.enter();
    init(s.client, 3);
    catalog(s.client, gameInfo('aaaaaaaaaa', 'chpok'));
    await Promise.resolve();
    await Promise.resolve();
    expect(calls).toHaveBeenCalledWith('aaaaaaaaaa', '', 'boards', { top: 10 });
    const [kind, , boards] = pages[0].shown[pages[0].shown.length - 1] as unknown as [
      string,
      unknown,
      any,
    ];
    expect(kind).toBe('game');
    expect(boards.boards[0]).toMatchObject({ name: 'best', title: 'Очки' });
    expect(boards.canEdit).toBe(false);
  });
});
