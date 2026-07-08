import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager } from './RoomManager';
import { CommunicationMode } from './CommunicationMode';

// Replaces the old ad-hoc Tests/*.js scripts (root Tests/ dir), which reimplemented
// this logic from scratch in plain JS against stale Spatial2D/Spatial3D concepts and
// never touched the real client code. These tests exercise the actual RoomManager.
describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('joinRoom fails for a room that was never created', () => {
    expect(manager.joinRoom(1, 'Alice', 'does-not-exist')).toBe(false);
  });

  it('joinRoom succeeds and getClientRoom reflects membership', () => {
    manager.createRoom('lobby', 'Lobby', [CommunicationMode.TextChat], true);

    expect(manager.joinRoom(1, 'Alice', 'lobby')).toBe(true);
    expect(manager.getClientRoom(1)?.id).toBe('lobby');
  });

  it('joining a new room switches membership and leaves the previous room', () => {
    manager.createRoom('lobby', 'Lobby', [CommunicationMode.TextChat], true);
    manager.createRoom('game', 'Game', [CommunicationMode.Spatial, CommunicationMode.TextChat]);

    manager.joinRoom(1, 'Alice', 'lobby');
    manager.joinRoom(1, 'Alice', 'game');

    expect(manager.getClientRoom(1)?.id).toBe('game');
    expect(manager.getRoomClientIds('lobby')).not.toContain(1);
  });

  it('joinRoom carries forward a compatible previous mode across a room switch', () => {
    manager.createRoom('game', 'Game', [CommunicationMode.Spatial, CommunicationMode.TextChat]);
    manager.createRoom('game2', 'Game2', [CommunicationMode.Spatial, CommunicationMode.TextChat]);

    manager.joinRoom(1, 'Alice', 'game');
    manager.setClientMode(1, CommunicationMode.Spatial);
    manager.joinRoom(1, 'Alice', 'game2');

    expect(manager.getClientRoom(1)?.getClient(1)?.currentMode).toBe(CommunicationMode.Spatial);
  });

  it('leaveRoom removes a non-persistent room once it is empty', () => {
    manager.createRoom('game', 'Game', [CommunicationMode.Spatial]);
    manager.joinRoom(1, 'Alice', 'game');

    manager.leaveRoom(1);

    expect(manager.getRoom('game')).toBeUndefined();
  });

  it('leaveRoom keeps a persistent room around even when empty', () => {
    manager.createRoom('lobby', 'Lobby', [CommunicationMode.TextChat], true);
    manager.joinRoom(1, 'Alice', 'lobby');

    manager.leaveRoom(1);

    expect(manager.getRoom('lobby')).toBeDefined();
  });

  it('setClientMode rejects a mode the room does not support', () => {
    manager.createRoom('lobby', 'Lobby', [CommunicationMode.TextChat], true);
    manager.joinRoom(1, 'Alice', 'lobby');

    expect(manager.setClientMode(1, CommunicationMode.Spatial)).toBe(false);
    expect(manager.getClientRoom(1)?.getClient(1)?.currentMode).toBe(CommunicationMode.TextChat);
  });

  it('setClientMode succeeds for a mode the room supports', () => {
    manager.createRoom('game', 'Game', [CommunicationMode.Spatial, CommunicationMode.TextChat]);
    manager.joinRoom(1, 'Alice', 'game');

    expect(manager.setClientMode(1, CommunicationMode.Spatial)).toBe(true);
    expect(manager.getClientRoom(1)?.getClient(1)?.currentMode).toBe(CommunicationMode.Spatial);
  });

  it('shouldReceiveSpatialUpdates reflects the client current mode', () => {
    manager.createRoom('game', 'Game', [CommunicationMode.Spatial, CommunicationMode.TextChat]);
    manager.joinRoom(1, 'Alice', 'game');

    expect(manager.shouldReceiveSpatialUpdates(1)).toBe(false); // default mode is TextChat

    manager.setClientMode(1, CommunicationMode.Spatial);
    expect(manager.shouldReceiveSpatialUpdates(1)).toBe(true);
  });

  it('shouldReceiveSpatialUpdates defaults to true for a client with no room', () => {
    // Matches the current client-side RoomManager behavior (fail open, unlike the
    // server's RoomManager which fails closed) — pinned here so a change is deliberate.
    expect(manager.shouldReceiveSpatialUpdates(999)).toBe(true);
  });

  it('resetClients clears membership but keeps room definitions', () => {
    manager.createRoom('lobby', 'Lobby', [CommunicationMode.TextChat], true);
    manager.createRoom('game', 'Game', [CommunicationMode.Spatial]);
    manager.joinRoom(1, 'Alice', 'lobby');

    manager.resetClients();

    expect(manager.getClientRoom(1)).toBeUndefined();
    expect(manager.getRoom('lobby')).toBeDefined();
    expect(manager.getRoom('game')).toBeDefined();
  });

  it('clearAll drops both membership and room definitions', () => {
    manager.createRoom('lobby', 'Lobby', [CommunicationMode.TextChat], true);
    manager.joinRoom(1, 'Alice', 'lobby');

    manager.clearAll();

    expect(manager.getClientRoom(1)).toBeUndefined();
    expect(manager.getRoom('lobby')).toBeUndefined();
  });
});
