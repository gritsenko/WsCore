import { CommunicationMode } from './CommunicationMode.js';

/**
 * Represents a client within a room
 */
export class RoomClient {
  public readonly id: number;
  public readonly name: string;
  public readonly joinedAt: Date;
  public currentMode: CommunicationMode;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
    this.joinedAt = new Date();
    this.currentMode = CommunicationMode.TextChat; // Default mode
  }
}
