import WsClient from '../network/WsClient';
import Player from '../game/Player';
import LobbyUI, { LobbyMember, LobbyMessage } from '../lobby/LobbyUI';
import { ChatEntry, ChatLogChange } from '../network/ChatLog';
import { PresenceStatus, PresenceUser } from '../network/ClientEvents';
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
 *
 * Chat is rendered from the client's per-room cache: entering a room shows what is
 * cached at once, then only the missed messages / older pages are added to the DOM.
 * The member list is the server's presence roster (online, away and offline users),
 * plus any anonymous connections currently in the room.
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
    this.ui.setOnLoadOlderCallback(() => this.loadOlder());

    this.unsubs.push(
      this.client.on('roomList', () => this.renderRooms()),
      this.client.on('roomJoined', roomId => this.handleRoomJoined(roomId)),
      this.client.on('roomJoinFailed', (roomId, error) => this.handleJoinFailed(roomId, error)),
      this.client.on('playerName', (id, name) => this.handlePlayerName(id, name)),
      this.client.on('roomUsers', (msg: RoomUsersUpdateEvent) => this.handleRoomUsersUpdate(msg)),
      this.client.on('chat', (roomId, entry) => this.handleChat(roomId, entry)),
      this.client.on('chatHistory', (roomId, change) => this.handleChatHistory(roomId, change)),
      this.client.on('presence', () => this.renderMembers())
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
    this.renderMembers(); // the roster may already be known (coming back from the game)
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
    const switched = this.ui.getCurrentRoomId() !== roomId;
    this.ui.setCurrentRoom(roomId);
    // Rooms have separate chats: show this room's cached log right away. (Staying in
    // the same room — a reconnect — keeps the rendered messages; the catch-up the
    // client requests on every join is appended when it arrives.)
    if (switched) this.renderChat(roomId);
    this.renderMembers();
    this.renderRooms();
  }

  // ==================== chat ====================

  private toMessage = (entry: ChatEntry): LobbyMessage => ({
    id: entry.id,
    name: entry.name,
    text: entry.text,
    sentAtMs: entry.sentAtMs,
    own: this.client.isOwnMessage(entry),
  });

  private renderChat(roomId: string): void {
    const log = this.client.getChatLog(roomId);
    this.ui.setMessages(log.entries.map(this.toMessage), log.hasMore);
  }

  private handleChat(roomId: string, entry: ChatEntry): void {
    if (roomId === this.ui.getCurrentRoomId()) this.ui.appendMessages([this.toMessage(entry)]);
  }

  private handleChatHistory(roomId: string, change: ChatLogChange): void {
    if (roomId !== this.ui.getCurrentRoomId()) return; // cached; rendered on entering
    const log = this.client.getChatLog(roomId);
    switch (change.kind) {
      case 'reset':
        this.renderChat(roomId);
        break;
      case 'append':
        this.ui.appendMessages(change.entries.map(this.toMessage));
        this.ui.setHistoryState(log.hasMore, log.loadingOlder);
        break;
      case 'prepend':
        this.ui.prependMessages(change.entries.map(this.toMessage), log.hasMore);
        break;
    }
  }

  /** The user scrolled near the top: fetch the previous page (one at a time). */
  private loadOlder(): void {
    if (this.client.loadOlderChat()) this.ui.setHistoryState(true, true);
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

  // ==================== members ====================

  /**
   * The member list: every known user with their presence — people who left stay
   * listed as offline — ordered online → away → offline. Anonymous connections (clients
   * that never identified, e.g. the test console) are listed while in our room.
   */
  private renderMembers(): void {
    const client = this.client;
    const room = client.getCurrentRoom();
    const members: (LobbyMember & { rank: number; sort: number })[] = [];

    for (const user of client.presence.values()) {
      const status =
        user.status === PresenceStatus.Online
          ? 'online'
          : user.status === PresenceStatus.Away
            ? 'away'
            : 'offline';
      members.push({
        key: `u${user.userId}`,
        name: user.name,
        status,
        isSelf: user.userId === client.myUserId,
        detail: this.memberDetail(user, room?.id ?? null),
        rank: status === 'online' ? 0 : status === 'away' ? 1 : 2,
        // Offline: most recently seen first.
        sort: status === 'offline' ? -user.lastSeenMs : 0,
      });
    }

    for (const guest of room?.clients.values() ?? []) {
      if (guest.userId !== 0) continue; // listed through presence
      const isSelf = guest.id === client.clientId;
      if (isSelf && client.myUserId !== 0) continue;
      // Every connection is anonymous and unnamed for a moment — between connecting
      // and its identify being processed. Listing those would flash a "Player 12"
      // entry each time someone arrives, so a guest appears once it has a name.
      if (!isSelf && (!guest.name || guest.name === `Player ${guest.id}`)) continue;
      members.push({
        key: `c${guest.id}`,
        name: (isSelf && client.myPlayerName) || guest.name || `Player ${guest.id}`,
        status: 'online',
        isSelf,
        rank: 0,
        sort: 0,
      });
    }

    members.sort(
      (a, b) =>
        a.rank - b.rank ||
        Number(b.isSelf) - Number(a.isSelf) ||
        a.sort - b.sort ||
        a.name.localeCompare(b.name)
    );
    this.ui.setMembers(members);
  }

  private memberDetail(user: PresenceUser, currentRoomId: string | null): string | undefined {
    if (user.status === PresenceStatus.Offline) return formatLastSeen(user.lastSeenMs);
    const elsewhere =
      user.roomId && user.roomId !== currentRoomId
        ? (this.client.roomManager.getRoom(user.roomId)?.name ?? user.roomId)
        : null;
    if (user.status === PresenceStatus.Away) return elsewhere ? `Отошёл · ${elsewhere}` : 'Отошёл';
    return elsewhere ?? undefined;
  }

  private handlePlayerName(id: number, name: string): void {
    if (id === this.client.clientId) this.ui.setCurrentUserId(id, name);
    // Identified users are renamed through presence; this covers anonymous guests.
    if (this.client.getCurrentRoom()?.getClient(id)) this.renderMembers();
  }

  private handleRoomUsersUpdate(msg: RoomUsersUpdateEvent): void {
    if (msg.roomId === this.ui.getCurrentRoomId()) this.renderMembers();
    this.renderRooms(); // the room's user count changed
  }
}

/** "был(а) 5 мин назад" — coarse on purpose: it is only refreshed with the list. */
function formatLastSeen(lastSeenMs: number): string {
  if (!lastSeenMs) return 'Не в сети';
  const minutes = Math.floor((Date.now() - lastSeenMs) / 60000);
  if (minutes < 1) return 'был(а) только что';
  if (minutes < 60) return `был(а) ${minutes} мин назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `был(а) ${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `был(а) ${days} дн назад`;
  return `был(а) ${new Date(lastSeenMs).toLocaleDateString([], { day: 'numeric', month: 'short' })}`;
}
