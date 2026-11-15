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
    client.on('chat', (name, text) => chats.push(`${name}: ${text}`));

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

    const chat = new ChatMessageEvent();
    chat.clientId = 7;
    chat.message = 'hi';
    client.onChatMessageEvent(chat);

    const rename = new SetPlayerNameEvent();
    rename.clientId = 7;
    rename.name = 'Bob';
    client.onSetPlayerNameEvent(rename);
    client.onChatMessageEvent(chat);

    expect(chats).toEqual(['User7: hi', 'Bob: hi']);
    expect(client.getCurrentRoom()!.getClient(7)!.name).toBe('Bob');
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
