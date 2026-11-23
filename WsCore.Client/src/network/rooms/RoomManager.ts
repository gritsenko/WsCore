import { CommunicationMode } from './CommunicationMode.js';
import { Room } from './Room.js';

/** One room as the server describes it (decoded from `RoomInfo`). */
export interface RoomDescription {
  id: string;
  name: string;
  supportedModes: CommunicationMode[];
  isPersistent: boolean;
  /** Seen only by admins and the members given access. */
  isPrivate?: boolean;
  /** Created by an admin (can be renamed / deleted), not built in. */
  isCreated?: boolean;
  userCount: number;
}

/**
 * Manages all rooms in the client, handles room creation, joining, and client membership
 */
export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private clientRoomMap: Map<number, string> = new Map();

  /**
   * Create a new room
   */
  public createRoom(
    roomId: string,
    roomName: string,
    supportedModes: CommunicationMode[],
    isPersistent: boolean = false
  ): Room {
    const room = new Room(roomId, roomName, supportedModes, isPersistent);
    this.rooms.set(roomId, room);
    return room;
  }

  /**
   * Get existing room by ID
   */
  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Join a client to a room
   */
  public joinRoom(clientId: number, clientName: string, roomId: string): boolean {
    const room = this.rooms.get(roomId);
    if (!room) {
      console.warn(`Room ${roomId} not found`);
      return false;
    }

    // If client is already in a room, remove them first (room switching)
    let previousMode: CommunicationMode | undefined;
    if (this.clientRoomMap.has(clientId)) {
      const currentRoom = this.getClientRoom(clientId);
      const currentClient = currentRoom?.getClient(clientId);
      previousMode = currentClient?.currentMode;
      this.leaveRoom(clientId);
    }

    if (room.addClient(clientId, clientName, previousMode)) {
      this.clientRoomMap.set(clientId, roomId);
      return true;
    }

    return false;
  }

  /**
   * Leave current room
   */
  public leaveRoom(clientId: number): boolean {
    const roomId = this.clientRoomMap.get(clientId);
    if (!roomId) return false;

    const room = this.rooms.get(roomId);
    if (room) {
      room.removeClient(clientId);

      // Remove empty rooms only if they're not persistent
      if (room.isEmpty && !room.isPersistent) {
        this.rooms.delete(roomId);
      }
    }

    return this.clientRoomMap.delete(clientId);
  }

  /**
   * Get client's current room
   */
  public getClientRoom(clientId: number): Room | undefined {
    const roomId = this.clientRoomMap.get(clientId);
    if (!roomId) return undefined;
    return this.getRoom(roomId);
  }

  /**
   * Change client's communication mode within their room
   */
  public setClientMode(clientId: number, mode: CommunicationMode): boolean {
    const room = this.getClientRoom(clientId);
    if (!room || !room.supportsMode(mode)) {
      return false;
    }

    const client = room.getClient(clientId);
    if (!client) return false;

    client.currentMode = mode;
    return true;
  }

  /**
   * Check if client should receive spatial updates
   */
  public shouldReceiveSpatialUpdates(clientId: number): boolean {
    const room = this.getClientRoom(clientId);
    if (!room) return true; // Default to full updates if no room

    const client = room.getClient(clientId);
    if (!client) return true;

    return client.currentMode === CommunicationMode.Spatial;
  }

  /**
   * Get all rooms
   */
  public getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Get clients in a specific room
   */
  public getRoomClientIds(roomId: string): number[] {
    const room = this.rooms.get(roomId);
    return room ? room.getClientIds() : [];
  }

  /**
   * Update room user count (for UI display)
   */
  public updateRoomUserCount(roomId: string, userCount: number): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.userCount = userCount;
    }
  }

  /**
   * Insert or update one room from the server's description, keeping its membership.
   */
  public upsertRoom(desc: RoomDescription): Room {
    let room = this.rooms.get(desc.id);
    if (!room) {
      room = this.createRoom(desc.id, desc.name, desc.supportedModes, desc.isPersistent);
    } else {
      room.name = desc.name;
      room.isPersistent = desc.isPersistent;
      room.supportedModes.clear();
      for (const mode of desc.supportedModes) room.supportedModes.add(mode);
    }
    room.userCount = desc.userCount;
    room.isPrivate = desc.isPrivate ?? false;
    room.isCreated = desc.isCreated ?? false;
    return room;
  }

  /**
   * Replace the room set with the server's list (RoomListEvent — the only source of
   * rooms): rooms missing from it are dropped (with any membership in them), existing
   * ones are updated in place, and iteration order follows the server's list.
   */
  public syncRooms(list: RoomDescription[]): void {
    const keep = new Set(list.map(d => d.id));
    for (const [clientId, roomId] of this.clientRoomMap) {
      if (!keep.has(roomId)) this.clientRoomMap.delete(clientId);
    }
    const previous = this.rooms;
    this.rooms = new Map();
    for (const desc of list) {
      const room = previous.get(desc.id);
      if (room) this.rooms.set(desc.id, room);
      this.upsertRoom(desc);
    }
  }

  /**
   * Remove all clients and dispose all rooms
   */
  public clearAll(): void {
    this.clientRoomMap.clear();
    this.rooms.clear();
  }

  /**
   * Drop all client membership but KEEP room definitions. Used on reconnect: the
   * session resets, the rooms stay until the next RoomListEvent replaces them.
   */
  public resetClients(): void {
    this.clientRoomMap.clear();
    for (const room of this.rooms.values()) {
      room.clients.clear();
    }
  }
}
