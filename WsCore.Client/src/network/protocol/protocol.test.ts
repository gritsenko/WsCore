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

  it('ChatMessageEvent(7, "hi") matches the pinned byte layout', () => {
    const value = new ChatMessageEvent();
    value.clientId = 7;
    value.message = 'hi';

    const bytes = Array.from(ChatMessageEvent.serialize(value));
    expect(bytes).toEqual([2, 7, 0, 0, 0, 253, 255, 255, 255, 2, 0, 0, 0, 104, 105]);

    const decoded = ChatMessageEvent.deserialize(new Uint8Array(bytes).buffer);
    expect(decoded).not.toBeNull();
    expect(decoded!.clientId).toBe(7);
    expect(decoded!.message).toBe('hi');
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
    5, 251, 255, 255, 255, 4, 0, 0, 0, 103, 97, 109, 101, 254, 255, 255, 255, 1, 0, 0, 0, 71, 2, 0,
    0, 0, 1, 0, 0, 0, 248, 255, 255, 255, 7, 0, 0, 0, 83, 112, 97, 116, 105, 97, 108, 1,
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
