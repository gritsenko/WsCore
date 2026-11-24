import { describe, it, expect } from 'vitest';
import { ChatMessageRequest } from './ChatMessageRequest';
import { ChatMessageEvent } from './ChatMessageEvent';
import { JoinRoomRequest } from './JoinRoomRequest';
import { HeartbeatEvent } from './HeartbeatEvent';
import { JoinRoomResultEvent } from './JoinRoomResultEvent';
import { RoomInfo } from './RoomInfo';
import { RoomListEvent } from './RoomListEvent';
import { MovementStateData } from './MovementStateData';
import { GameTickUpdateEvent } from './GameTickUpdateEvent';
import { HitPlayerStateData } from './HitPlayerStateData';
import { ChatHistoryEvent } from './ChatHistoryEvent';
import { ChatMessageData } from './ChatMessageData';
import { ChatHistoryRequest } from './ChatHistoryRequest';
import { IdentifyRequest } from './IdentifyRequest';
import { SetAwayRequest } from './SetAwayRequest';
import { PresenceUserInfo } from './PresenceUserInfo';
import { PresenceUpdateEvent } from './PresenceUpdateEvent';
import { PresenceSnapshotEvent } from './PresenceSnapshotEvent';
import { AccountResultEvent } from './AccountResultEvent';
import { LoginRequest } from './LoginRequest';
import { SetAvatarRequest } from './SetAvatarRequest';

// Fixed binary samples captured from a known-good encode of each message (see the
// roadmap's stage-4 test item). These pin the wire format independently of whatever
// serialize()/deserialize() happen to agree on today — a byte-layout regression in
// either direction (or a drift from the server's MemoryPack encoding) breaks this
// test even if the TS round-trip alone would still "work".
describe('protocol round-trip against fixed binary samples', () => {
  it('ChatMessageRequest("hi") matches the pinned byte layout', () => {
    const value = new ChatMessageRequest();
    value.message = 'hi';

    const bytes = Array.from(ChatMessageRequest.serialize(value));
    expect(bytes).toEqual([1, 253, 255, 255, 255, 2, 0, 0, 0, 104, 105]);

    const decoded = ChatMessageRequest.deserialize(new Uint8Array(bytes).buffer);
    expect(decoded).not.toBeNull();
    expect(decoded!.message).toBe('hi');
  });

  // Chat history + presence messages. Like the stage C/D ones below, the same byte
  // arrays are pinned on the server (WsServer.Tests/ProtocolWireFormatTests.cs).
  it('ChatMessageEvent matches the pinned byte layout', () => {
    const value = new ChatMessageEvent();
    value.clientId = 7;
    value.message = 'hi';
    value.id = 42;
    value.userId = 3;
    value.name = 'Al';
    value.sentAtMs = 1000;

    const bytes = Array.from(ChatMessageEvent.serialize(value));
    expect(bytes).toEqual([
      6, 7, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 104, 105, 42, 0, 0, 0, 3, 0, 0, 0, 253, 255,
      255, 255, 2, 0, 0, 0, 65, 108, 0, 0, 0, 0, 0, 64, 143, 64,
    ]);

    const decoded = ChatMessageEvent.deserialize(new Uint8Array(bytes).buffer)!;
    expect(decoded.clientId).toBe(7);
    expect(decoded.message).toBe('hi');
    expect(decoded.id).toBe(42);
    expect(decoded.userId).toBe(3);
    expect(decoded.name).toBe('Al');
    expect(decoded.sentAtMs).toBe(1000);
  });

  it('a pre-history ChatMessageEvent (2 members) still decodes', () => {
    // MemoryPack version tolerance: the fields appended for history default to zero.
    const old = [2, 7, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 104, 105];
    const decoded = ChatMessageEvent.deserialize(new Uint8Array(old).buffer)!;
    expect(decoded.clientId).toBe(7);
    expect(decoded.message).toBe('hi');
    expect(decoded.id).toBe(0);
  });

  it('ChatHistoryEvent matches the pinned byte layout', () => {
    const message = new ChatMessageData();
    message.id = 42;
    message.userId = 3;
    message.name = 'Al';
    message.text = 'hi';
    message.sentAtMs = 1000;
    const value = new ChatHistoryEvent();
    value.roomId = 'game';
    value.epoch = 5;
    value.reset = true;
    value.hasMore = true;
    value.messages = [message];

    const bytes = Array.from(ChatHistoryEvent.serialize(value));
    expect(bytes).toEqual([
      6, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 5, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0,
      0, 5, 42, 0, 0, 0, 3, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 65, 108, 253, 255, 255, 255,
      2, 0, 0, 0, 104, 105, 0, 0, 0, 0, 0, 64, 143, 64,
    ]);

    const decoded = ChatHistoryEvent.deserialize(new Uint8Array(bytes).buffer)!;
    expect(decoded.roomId).toBe('game');
    expect(decoded.epoch).toBe(5);
    expect(decoded.beforeId).toBe(0);
    expect(decoded.reset).toBe(true);
    expect(decoded.hasMore).toBe(true);
    expect(decoded.messages![0]!.text).toBe('hi');
  });

  it('ChatHistoryRequest / IdentifyRequest / SetAwayRequest match the pinned byte layouts', () => {
    const history = new ChatHistoryRequest();
    history.beforeId = 10;
    history.epoch = 5;
    expect(Array.from(ChatHistoryRequest.serialize(history))).toEqual([
      3, 10, 0, 0, 0, 0, 0, 0, 0, 5, 0, 0, 0,
    ]);

    const identify = new IdentifyRequest();
    identify.userKey = 'abcdefghijklmnop';
    identify.name = 'Al';
    expect(Array.from(IdentifyRequest.serialize(identify))).toEqual([
      2, 239, 255, 255, 255, 16, 0, 0, 0, 97, 98, 99, 100, 101, 102, 103, 104, 105, 106, 107, 108,
      109, 110, 111, 112, 253, 255, 255, 255, 2, 0, 0, 0, 65, 108,
    ]);

    const away = new SetAwayRequest();
    away.away = true;
    expect(Array.from(SetAwayRequest.serialize(away))).toEqual([1, 1]);
  });

  it('PresenceUpdateEvent / PresenceSnapshotEvent match the pinned byte layouts', () => {
    const user = new PresenceUserInfo();
    user.userId = 3;
    user.name = 'Al';
    user.status = 2;
    user.roomId = 'game';
    user.lastSeenMs = 1000;
    user.about = 'hi';
    user.avatarVersion = 9;
    user.login = 'al';
    user.isAdmin = true;
    const userBytes = [
      9, 3, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 65, 108, 2, 251, 255, 255, 255, 4, 0, 0, 0,
      103, 97, 109, 101, 0, 0, 0, 0, 0, 64, 143, 64, 253, 255, 255, 255, 2, 0, 0, 0, 104, 105, 9, 0,
      0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 97, 108, 1,
    ];

    const update = new PresenceUpdateEvent();
    update.user = user;
    const updateBytes = Array.from(PresenceUpdateEvent.serialize(update));
    expect(updateBytes).toEqual([1, ...userBytes]);
    const decodedUpdate = PresenceUpdateEvent.deserialize(new Uint8Array(updateBytes).buffer)!;
    expect(decodedUpdate.user!.status).toBe(2);
    expect(decodedUpdate.user!.roomId).toBe('game');
    expect(decodedUpdate.user!.about).toBe('hi');
    expect(decodedUpdate.user!.avatarVersion).toBe(9);
    expect(decodedUpdate.user!.login).toBe('al');
    expect(decodedUpdate.user!.isAdmin).toBe(true);

    const snapshot = new PresenceSnapshotEvent();
    snapshot.yourUserId = 3;
    snapshot.users = [user];
    snapshot.yourLogin = 'al';
    snapshot.yourLeaderboardHidden = true;
    const snapshotBytes = Array.from(PresenceSnapshotEvent.serialize(snapshot));
    expect(snapshotBytes).toEqual([
      4,
      3,
      0,
      0,
      0,
      1,
      0,
      0,
      0,
      ...userBytes,
      ...[253, 255, 255, 255, 2, 0, 0, 0, 97, 108],
      1,
    ]);
    const decodedSnapshot = PresenceSnapshotEvent.deserialize(
      new Uint8Array(snapshotBytes).buffer
    )!;
    expect(decodedSnapshot.yourUserId).toBe(3);
    expect(decodedSnapshot.users![0]!.lastSeenMs).toBe(1000);
    expect(decodedSnapshot.yourLogin).toBe('al');
  });

  // Accounts. The same byte arrays are pinned in ProtocolWireFormatTests.cs.
  it('AccountResultEvent / LoginRequest / SetAvatarRequest match the pinned byte layouts', () => {
    const resultBytes = [4, 2, 1, 255, 255, 255, 255, 253, 255, 255, 255, 2, 0, 0, 0, 97, 108];
    const result = AccountResultEvent.deserialize(new Uint8Array(resultBytes).buffer)!;
    expect([result.action, result.success, result.error, result.login]).toEqual([
      2,
      true,
      null,
      'al',
    ]);
    expect(Array.from(AccountResultEvent.serialize(result))).toEqual(resultBytes);

    const login = new LoginRequest();
    login.login = 'al';
    login.password = 'pw';
    login.userKey = 'k';
    expect(Array.from(LoginRequest.serialize(login))).toEqual([
      3, 253, 255, 255, 255, 2, 0, 0, 0, 97, 108, 253, 255, 255, 255, 2, 0, 0, 0, 112, 119, 254,
      255, 255, 255, 1, 0, 0, 0, 107,
    ]);

    const avatar = new SetAvatarRequest();
    avatar.image = new Uint8Array([1, 2, 3]);
    expect(Array.from(SetAvatarRequest.serialize(avatar))).toEqual([1, 3, 0, 0, 0, 1, 2, 3]);
  });

  it('JoinRoomRequest("game") matches the pinned byte layout', () => {
    const value = new JoinRoomRequest();
    value.roomId = 'game';

    const bytes = Array.from(JoinRoomRequest.serialize(value));
    expect(bytes).toEqual([
      2, 255, 255, 255, 255, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101,
    ]);

    const decoded = JoinRoomRequest.deserialize(new Uint8Array(bytes).buffer);
    expect(decoded).not.toBeNull();
    expect(decoded!.roomId).toBe('game');
  });

  // Stage C messages. The same byte arrays are pinned on the server side
  // (WsServer.Tests/ProtocolWireFormatTests.cs) against C# MemoryPack, so both ends
  // are held to one wire format.
  function gameRoom(): RoomInfo {
    const r = new RoomInfo();
    r.id = 'game';
    r.name = 'G';
    r.userCount = 2;
    r.supportedModes = ['Spatial'];
    r.isPersistent = true;
    return r;
  }
  const GAME_ROOM_BYTES = [
    7, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 254, 255, 255, 255, 1, 0, 0, 0, 71, 2, 0,
    0, 0, 1, 0, 0, 0, 248, 255, 255, 255, 7, 0, 0, 0, 83, 112, 97, 116, 105, 97, 108, 1,
    // isPrivate, isCreated
    0, 0,
  ];

  it('HeartbeatEvent is an empty object', () => {
    expect(Array.from(HeartbeatEvent.serialize(new HeartbeatEvent()))).toEqual([0]);
    expect(HeartbeatEvent.deserialize(new Uint8Array([0]).buffer)).toBeInstanceOf(HeartbeatEvent);
  });

  it('JoinRoomResultEvent (success, with room) matches the pinned byte layout', () => {
    const value = new JoinRoomResultEvent();
    value.roomId = 'game';
    value.success = true;
    value.room = gameRoom();

    const bytes = Array.from(JoinRoomResultEvent.serialize(value));
    expect(bytes).toEqual([
      4, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 1, 255, 255, 255, 255,
      ...GAME_ROOM_BYTES,
    ]);

    const decoded = JoinRoomResultEvent.deserialize(new Uint8Array(bytes).buffer)!;
    expect(decoded.success).toBe(true);
    expect(decoded.error).toBeNull();
    expect(decoded.room!.supportedModes).toEqual(['Spatial']);
    expect(decoded.room!.isPersistent).toBe(true);
  });

  it('JoinRoomResultEvent (failure) matches the pinned byte layout', () => {
    const value = new JoinRoomResultEvent();
    value.roomId = 'x';
    value.success = false;
    value.error = 'no';

    const bytes = Array.from(JoinRoomResultEvent.serialize(value));
    expect(bytes).toEqual([4, 254, 255, 255, 255, 1, 0, 0, 0, 120, 0, 253, 255, 255, 255, 2, 0, 0, 0, 110, 111, 255]);

    const decoded = JoinRoomResultEvent.deserialize(new Uint8Array(bytes).buffer)!;
    expect(decoded.success).toBe(false);
    expect(decoded.error).toBe('no');
    expect(decoded.room).toBeNull();
  });

  it('RoomListEvent (no eventType field, RoomInfo.isPersistent) matches the pinned byte layout', () => {
    const value = new RoomListEvent();
    value.rooms = [gameRoom()];

    const bytes = Array.from(RoomListEvent.serialize(value));
    expect(bytes).toEqual([1, 1, 0, 0, 0, ...GAME_ROOM_BYTES]);

    const decoded = RoomListEvent.deserialize(new Uint8Array(bytes).buffer)!;
    expect(decoded.rooms![0]!.id).toBe('game');
    expect(decoded.rooms![0]!.userCount).toBe(2);
  });

  // Stage D: the tick snapshot. Same bytes as ProtocolWireFormatTests.cs on the server.
  function movement(): MovementStateData {
    const m = new MovementStateData();
    m.playerId = 7;
    m.x = 1.5;
    m.y = -2;
    m.animationState = 1;
    return m;
  }
  // header(4) | playerId u32 | x f32 | y f32 | animationState u8 — 14 bytes (was 49).
  const MOVEMENT_BYTES = [4, 7, 0, 0, 0, 0, 0, 192, 63, 0, 0, 0, 192, 1];

  it('MovementStateData matches the pinned byte layout', () => {
    const bytes = Array.from(MovementStateData.serialize(movement()));
    expect(bytes).toEqual(MOVEMENT_BYTES);

    const decoded = MovementStateData.deserialize(new Uint8Array(bytes).buffer)!;
    expect([decoded.playerId, decoded.x, decoded.y, decoded.animationState]).toEqual([7, 1.5, -2, 1]);
  });

  it('GameTickUpdateEvent matches the pinned byte layout', () => {
    const value = new GameTickUpdateEvent();
    value.serverTimeMs = 1000;
    value.movementStates = [movement()];
    value.destroyedBulletsIds = [3];
    value.respawnedPlayerIds = [];
    const hit = new HitPlayerStateData();
    hit.playerId = 7;
    hit.hitterId = 9;
    hit.newHp = 50;
    value.hitPlayersState = [hit];

    const bytes = Array.from(GameTickUpdateEvent.serialize(value));
    expect(bytes).toEqual([
      5, 232, 3, 0, 0, 1, 0, 0, 0, ...MOVEMENT_BYTES, 1, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0,
      0, 3, 7, 0, 0, 0, 9, 0, 0, 0, 50, 0, 0, 0,
    ]);

    const decoded = GameTickUpdateEvent.deserialize(new Uint8Array(bytes).buffer)!;
    expect(decoded.serverTimeMs).toBe(1000);
    expect(decoded.movementStates![0]!.x).toBe(1.5);
    expect(decoded.destroyedBulletsIds).toEqual([3]);
    expect(decoded.respawnedPlayerIds).toEqual([]);
    expect(decoded.hitPlayersState![0]!.newHp).toBe(50);
  });

  it('round-trips a variety of chat message payloads, including empty and unicode', () => {
    for (const message of ['', 'a', 'hello world', 'emoji: 🎮', 'x'.repeat(500)]) {
      const value = new ChatMessageRequest();
      value.message = message;

      const decoded = ChatMessageRequest.deserialize(
        ChatMessageRequest.serialize(value).buffer as ArrayBuffer
      );

      expect(decoded!.message).toBe(message);
    }
  });

  it('deserialize on a null-encoded object returns null', () => {
    const value: ChatMessageRequest | null = null;
    const bytes = ChatMessageRequest.serialize(value);

    expect(ChatMessageRequest.deserialize(bytes.buffer as ArrayBuffer)).toBeNull();
  });
});
