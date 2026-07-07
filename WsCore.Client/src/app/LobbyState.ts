import WsClient from '../network/WsClient';
import Player from '../game/Player';
import LobbyUI from '../lobby/LobbyUI';
import { Unsubscribe } from '../utils/Emitter';
import { RoomUsersUpdateEvent } from '../network/protocol/RoomUsersUpdateEvent';

const ROOM_IDS = ['lobby', 'voice', 'game'];

/**
 * The lobby state: Discord-style text chat + room list. UI only — it drives
 * LobbyUI from the shared client's events and owns no socket. Subscriptions are
 * attached on enter() and detached on exit() so switching to the game leaks nothing.
 */
export default class LobbyState {
  private readonly client: WsClient<Player>;
  private readonly onEnterGame: () => void;
  private ui!: LobbyUI;
  private unsubs: Unsubscribe[] = [];

  constructor(client: WsClient<Player>, onEnterGame: () => void) {
    this.client = client;
    this.onEnterGame = onEnterGame;
  }

  enter(): void {
    // Build the UI here (not in the constructor) so the outgoing state has already
    // torn down its own DOM by the time transitionTo() calls enter().
    this.ui = new LobbyUI();
    this.ui.setOnMessageCallback(message => this.client.sendChatMessageRequest(message));
    this.ui.setOnRoomJoinCallback(roomId => this.joinRoom(roomId));
    this.ui.setOnPlayCallback(() => this.onEnterGame());

    this.unsubs.push(
      this.client.on('playerName', (id, name) => this.handlePlayerName(id, name)),
      this.client.on('playerJoined', (p: Player) => this.handlePlayerJoined(p)),
      this.client.on('playerRemove', (p: Player) => this.handlePlayerLeft(p.id)),
      this.client.on('roomUsers', (msg: RoomUsersUpdateEvent) => this.handleRoomUsersUpdate(msg)),
      this.client.on('chat', (name, text, isOwn) => this.ui.addMessage(name, text, isOwn))
    );
  }

  onSessionInit(): void {
    this.ui.setCurrentUserId(this.client.clientId);
    this.ui.setCurrentRoom('lobby');
    this.client.joinRoom('lobby');
    this.populateCurrentRoomUsers();
    this.updateRoomUserCounts();
  }

  exit(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.ui.destroy();
  }

  private joinRoom(roomId: string): void {
    this.client.leaveRoom();
    this.ui.clearMessages();
    this.ui.clearAllUsers();

    if (this.client.joinRoom(roomId)) {
      this.ui.setCurrentRoom(roomId);
      this.populateCurrentRoomUsers();
      this.updateRoomUserCounts();
    } else {
      console.error(`Failed to join room: ${roomId}`);
    }
  }

  private populateCurrentRoomUsers(): void {
    const room = this.client.getCurrentRoom();
    if (!room) return;
    for (const clientId of room.getClientIds()) {
      const name = room.getClient(clientId)?.name || `Player ${clientId}`;
      this.ui.addUser(clientId, name);
    }
  }

  private updateRoomUserCounts(): void {
    for (const roomId of ROOM_IDS) {
      this.ui.updateRoomUserCount(roomId, this.client.roomManager.getRoomClientIds(roomId).length);
    }
  }

  private handlePlayerName(id: number, name: string): void {
    this.ui.addUser(id, name || `Player ${id}`);
  }

  private handlePlayerJoined(player: Player): void {
    const room = this.client.getCurrentRoom();
    if (room && room.getClient(player.id)) {
      const name = this.client.playerNames[player.id] || `Player ${player.id}`;
      this.ui.addUser(player.id, name);
    }
    this.updateRoomUserCounts();
  }

  private handlePlayerLeft(id: number): void {
    this.ui.removeUser(id);
    delete this.client.playerNames[id];
    this.updateRoomUserCounts();
  }

  private handleRoomUsersUpdate(msg: RoomUsersUpdateEvent): void {
    const room = this.client.getCurrentRoom();
    if (room && room.id === msg.roomId && msg.users) {
      this.ui.clearAllUsers();
      for (const user of msg.users) {
        if (user) this.ui.addUser(user.clientId, user.name || `Player ${user.clientId}`);
      }
    }
  }
}
