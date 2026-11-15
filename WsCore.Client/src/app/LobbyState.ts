import WsClient from '../network/WsClient';
import Player from '../game/Player';
import LobbyUI from '../lobby/LobbyUI';
import { Unsubscribe } from '../utils/Emitter';
import { RoomUsersUpdateEvent } from '../network/protocol/RoomUsersUpdateEvent';
import { CommunicationMode } from '../network/rooms/CommunicationMode';

/**
 * The lobby state: Discord-style text chat + room list. UI only — it drives
 * LobbyUI from the shared client's events and owns no socket. Subscriptions are
 * attached on enter() and detached on exit() so switching to the game leaks nothing.
 *
 * Works without any Player objects (a connection in the lobby has no avatar): the
 * room list comes from the server (RoomListEvent), the user list from
 * RoomUsersUpdateEvent, and the current room only changes when the server confirms
 * a join (`roomJoined`); until then the target room is shown as pending.
 */
export default class LobbyState {
  private readonly client: WsClient<Player>;
  private readonly onEnterGame: (roomId: string) => void;
  private ui!: LobbyUI;
  private unsubs: Unsubscribe[] = [];

  constructor(client: WsClient<Player>, onEnterGame: (roomId: string) => void) {
    this.client = client;
    this.onEnterGame = onEnterGame;
  }

  enter(): void {
    // Build the UI here (not in the constructor) so the outgoing state has already
    // torn down its own DOM by the time transitionTo() calls enter().
    this.ui = new LobbyUI();
    this.ui.setOnMessageCallback(message => this.client.sendChatMessageRequest(message));
    this.ui.setOnRoomJoinCallback(roomId => this.requestJoin(roomId));
    this.ui.setOnPlayCallback(roomId => this.onEnterGame(roomId));

    this.unsubs.push(
      this.client.on('roomList', () => this.renderRooms()),
      this.client.on('roomJoined', roomId => this.handleRoomJoined(roomId)),
      this.client.on('roomJoinFailed', (roomId, error) => this.handleJoinFailed(roomId, error)),
      this.client.on('playerName', (id, name) => this.handlePlayerName(id, name)),
      this.client.on('roomUsers', (msg: RoomUsersUpdateEvent) => this.handleRoomUsersUpdate(msg)),
      this.client.on('chat', (name, text, isOwn) => this.ui.addMessage(name, text, isOwn))
    );

    // Rooms may already be known (coming back from the game).
    this.renderRooms();
  }

  /**
   * First connect / reconnect: the server places every new connection in its home
   * room (the lobby) by itself and confirms it with `roomJoined` — nothing to send.
   * Coming back from the game (already connected): ask to return to that home room;
   * the game room's avatar and players go away once the server confirms.
   */
  onSessionInit(): void {
    this.ui.setCurrentUserId(this.client.clientId, this.client.myPlayerName);
    const current = this.client.getCurrentRoom();
    if (current && !current.supportsMode(CommunicationMode.Spatial)) {
      // Already in a lobby-type room (e.g. the home-room result arrived first).
      this.showRoom(current.id);
    } else if (this.client.homeRoomId) {
      this.requestJoin(this.client.homeRoomId);
    }
  }

  exit(): void {
    for (const off of this.unsubs) off();
    this.unsubs = [];
    this.ui.destroy();
  }

  private requestJoin(roomId: string): void {
    this.ui.setPendingRoom(roomId);
    this.client.joinRoom(roomId);
  }

  private handleRoomJoined(roomId: string): void {
    const room = this.client.roomManager.getRoom(roomId);
    if (room?.supportsMode(CommunicationMode.Spatial)) {
      // A game-room join that landed after we left the game (it was still in flight):
      // the lobby never keeps an avatar — go back to the home room.
      if (this.client.homeRoomId) this.requestJoin(this.client.homeRoomId);
      return;
    }
    this.showRoom(roomId);
  }

  private showRoom(roomId: string): void {
    if (this.ui.getCurrentRoomId() !== roomId) {
      // Rooms have separate chats.
      this.ui.clearMessages();
    }
    this.ui.setCurrentRoom(roomId);
    this.populateCurrentRoomUsers();
    this.renderRooms();
  }

  private handleJoinFailed(roomId: string, error: string): void {
    // Membership is unchanged: stay where we are and say why.
    this.ui.setPendingRoom(null);
    const name = this.client.roomManager.getRoom(roomId)?.name ?? roomId;
    this.ui.addSystemMessage(`Could not join ${name}: ${error}`);
  }

  private renderRooms(): void {
    this.ui.setRooms(
      this.client.roomManager.getAllRooms().map(room => ({
        id: room.id,
        name: room.name,
        userCount: room.userCount,
        playable: room.supportsMode(CommunicationMode.Spatial),
      }))
    );
  }

  private populateCurrentRoomUsers(): void {
    this.ui.clearAllUsers();
    const room = this.client.getCurrentRoom();
    if (!room) return;
    for (const clientId of room.getClientIds()) {
      const name = room.getClient(clientId)?.name || `Player ${clientId}`;
      this.ui.addUser(clientId, name);
    }
  }

  private handlePlayerName(id: number, name: string): void {
    if (id === this.client.clientId) this.ui.setCurrentUserId(id, name);
    // Only members of our room are listed (renames arrive from our room only anyway).
    if (this.client.getCurrentRoom()?.getClient(id)) this.ui.addUser(id, name || `Player ${id}`);
  }

  private handleRoomUsersUpdate(msg: RoomUsersUpdateEvent): void {
    if (msg.roomId === this.ui.getCurrentRoomId()) this.populateCurrentRoomUsers();
    this.renderRooms(); // the room's user count changed
  }
}
