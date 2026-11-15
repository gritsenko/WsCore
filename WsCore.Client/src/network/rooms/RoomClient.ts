import { CommunicationMode } from './CommunicationMode.js';

/**
 * Represents a client within a room
 */
export class RoomClient {
  public readonly id: number;
  /** Mutable: updated when the server reports a rename (SetPlayerNameEvent). */
  public name: string;
  public readonly joinedAt: Date;
  public currentMode: CommunicationMode;
  /** The stable user behind this connection; 0 for an anonymous (unidentified) one. */
  public userId = 0;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
    this.joinedAt = new Date();
    this.currentMode = CommunicationMode.TextChat; // Default mode
  }
}
