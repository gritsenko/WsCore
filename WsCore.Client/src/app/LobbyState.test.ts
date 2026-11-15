import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WsClient from '../network/WsClient';
import Player from '../game/Player';
import { RoomInfo } from '../network/protocol/RoomInfo';
import { RoomListEvent } from '../network/protocol/RoomListEvent';
import { JoinRoomResultEvent } from '../network/protocol/JoinRoomResultEvent';
import { InitPlayerEvent } from '../network/protocol/InitPlayerEvent';

// LobbyState drives the (DOM-only) LobbyUI from client events. The UI is replaced by
// a recorder so the lobby's room flow can be checked without a DOM.

const ui = {
  calls: [] as string[],
  rooms: [] as { id: string; playable: boolean; userCount: number }[],
  current: null as string | null,
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
    clearMessages() {
      ui.calls.push('clearMessages');
    }
    clearAllUsers() {}
    addUser() {}
    addMessage() {}
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
    expect(ui.calls).toContain('clearMessages'); // separate chats

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
