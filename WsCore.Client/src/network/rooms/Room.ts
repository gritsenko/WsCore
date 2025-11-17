import { CommunicationMode } from './CommunicationMode.js';
import { RoomClient } from './RoomClient.js';

/**
 * Represents a room with specific communication modes and client membership
 */
export class Room {
  public readonly id: string;
  public name: string;
  public readonly supportedModes: Set<CommunicationMode>;
  public readonly clients: Map<number, RoomClient>;
  public readonly createdAt: Date;
  public hostClientId?: number;
  public userCount: number = 0;
  public isPersistent: boolean = false; // Default rooms should not be deleted

  constructor(
    id: string,
    name: string,
    supportedModes: CommunicationMode[],
    isPersistent: boolean = false
  ) {
    this.id = id;
    this.name = name;
    this.supportedModes = new Set(supportedModes);
    this.clients = new Map();
    this.createdAt = new Date();
    this.isPersistent = isPersistent;
  }

  /**
   * Check if the room supports a specific communication mode
   */
  public supportsMode(mode: CommunicationMode): boolean {
    return this.supportedModes.has(mode);
  }

  /**
   * Add a client to the room
   */
  public addClient(clientId: number, clientName: string, mode?: CommunicationMode): boolean {
    if (!this.clients.has(clientId)) {
      const client = new RoomClient(clientId, clientName);
      if (mode && this.supportsMode(mode)) {
        client.currentMode = mode;
      }
      this.clients.set(clientId, client);
      return true;
    }
    return false;
  }

  /**
   * Remove a client from the room
   */
  public removeClient(clientId: number): boolean {
    return this.clients.delete(clientId);
  }

  /**
   * Get client by ID
   */
  public getClient(clientId: number): RoomClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Get all client IDs in the room
   */
  public getClientIds(): number[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Check if room has any clients
   */
  public get isEmpty(): boolean {
    return this.clients.size === 0;
  }

  /**
   * Get client count
   */
  public get clientCount(): number {
    return this.clients.size;
  }
}
