import WsClient from '../network/WsClient';
import Player from '../game/Player';
import LobbyUI, { LobbyMember, LobbyMessage, VoiceControl } from '../lobby/LobbyUI';
import type VoiceChat from '../voice/VoiceChat';
import { ChatEntry, ChatLogChange } from '../network/ChatLog';
import {
  AccountAction,
  AccountResult,
  PresenceStatus,
  PresenceUser,
} from '../network/ClientEvents';
import type ChatAlerts from './ChatAlerts';
import ProfileDialog, { ProfileSection, ProfileView } from '../lobby/ProfileDialog';
import ChannelDialog, {
  ChannelDialogView,
  CreateChannelDialog,
  describeRestriction,
} from '../lobby/ChannelDialog';
import {
  ModerationAction,
  ModerationResult,
  describeModerationError,
  formatUntil,
} from '../network/Permissions';
import { prepareAvatar } from '../utils/AvatarImage';
import { Unsubscribe } from '../utils/Emitter';
import { RoomUsersUpdateEvent } from '../network/protocol/RoomUsersUpdateEvent';
import { CommunicationMode } from '../network/rooms/CommunicationMode';
import UpdateChecker from '../utils/UpdateChecker';
import PortalUI, { PortalCard } from '../portal/PortalUI';
import GameHost from '../portal/GameHost';
import { newSessionId } from '../portal/PlaySession';
import { loadOrCreateVisitorId } from './IdentityStorage';
import type { ApiToken, PortalGame } from '../network/ClientEvents';

/** A page of the games portal: the catalog, or one game's page. */
export type PortalRoute = { kind: 'catalog' } | { kind: 'game'; slug: string };

/** The portal page a path names (/games, /games/{slug}), or null for anything else. */
export function routeFromPath(path: string): PortalRoute | null {
  const m = /^\/games(?:\/([^/]+))?\/?$/.exec(path);
  if (!m) return null;
  return m[1]
    ? { kind: 'game', slug: decodeURIComponent(m[1]).toLowerCase() }
    : { kind: 'catalog' };
}

export function pathOf(route: PortalRoute): string {
  return route.kind === 'catalog' ? '/games' : `/games/${encodeURIComponent(route.slug)}`;
}

/** How a game's page was reached (analytics): a card, its address opened directly, back / forward. */
export type ViewSource = 'catalog' | 'link' | 'nav';

/** Phone or not, for the numbers (no user agent is ever sent). */
function deviceClass(): 'mobile' | 'desktop' {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
    ? 'mobile'
    : 'desktop';
}

/** The address bar, as the portal uses it (replaceable in tests). */
export interface PortalNavigation {
  path(): string;
  push(path: string): void;
  replace(path: string): void;
  /** Back / forward; returns the unsubscribe. */
  onPop(listener: () => void): () => void;
}

function browserNavigation(): PortalNavigation {
  if (typeof window === 'undefined')
    return { path: () => '/', push: () => {}, replace: () => {}, onPop: () => () => {} };
  return {
    path: () => location.pathname,
    push: path => history.pushState(null, '', path),
    replace: path => history.replaceState(null, '', path),
    onPop: listener => {
      window.addEventListener('popstate', listener);
      return () => window.removeEventListener('popstate', listener);
    },
  };
}

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
 *
 * It also owns the profile dialog (name, avatar, about, claiming the account): the
 * dialog reports what the user did, this state sends it and shows the server's answer.
 */

/** Server `AccountError` codes, as the profile dialog words them. */
const ACCOUNT_ERRORS: Record<string, string> = {
  not_identified: 'Сервер ещё не знает вас — попробуйте через секунду',
  invalid_login: 'Логин: 3–32 символа — латиница, цифры, точка, _ и -',
  invalid_password: 'Пароль должен быть не короче 8 символов',
  login_taken: 'Этот логин уже занят',
  already_claimed: 'Аккаунт уже закреплён',
  not_claimed: 'Сначала закрепите аккаунт',
  too_fast: 'Слишком часто — попробуйте через секунду',
  busy: 'Предыдущий запрос ещё выполняется',
  invalid_image: 'Не удалось сохранить изображение',
};

const ACCOUNT_SECTIONS: Record<AccountAction, ProfileSection> = {
  [AccountAction.Claim]: 'account',
  [AccountAction.Login]: 'account',
  [AccountAction.Logout]: 'account',
  [AccountAction.Profile]: 'profile',
  [AccountAction.Avatar]: 'avatar',
};

const MODERATION_DONE: Partial<Record<ModerationAction, string>> = {
  [ModerationAction.SetAdmin]: 'Права администратора обновлены',
  [ModerationAction.Restrict]: 'Ограничения обновлены',
  [ModerationAction.SetDefaults]: 'Разрешения канала сохранены',
  [ModerationAction.SetServerAdmin]: 'Роль администратора сервера обновлена',
  [ModerationAction.UpdateChannel]: 'Канал сохранён',
  [ModerationAction.SetAccess]: 'Доступ обновлён',
};

/** Why voice stopped / could not start (VoiceChat's and the server's `VoiceError` codes). */
const VOICE_ERRORS: Record<string, string> = {
  mic_denied: 'Нет доступа к микрофону — разрешите его в настройках браузера',
  mic_missing: 'Микрофон не найден',
  mic_unavailable: 'Микрофон занят или недоступен',
  mic_lost: 'Микрофон отключился',
  insecure: 'Голос работает только по HTTPS',
  full: 'В канале нет мест',
  banned: 'Вы заблокированы в этом канале',
  no_access: 'Нет доступа к каналу',
  no_channel: 'Канал не найден',
  not_voice: 'Это не голосовой канал',
  not_identified: 'Сервер ещё не знает вас — попробуйте через секунду',
  too_fast: 'Слишком часто — попробуйте через секунду',
  moved: 'Вы подключились к голосу в другой вкладке',
  removed: 'Вас отключили от голосового канала',
};

export function describeVoiceError(code: string): string {
  return VOICE_ERRORS[code] ?? 'Не удалось подключиться к голосу';
}

const ACCOUNT_DONE: Partial<Record<AccountAction, string>> = {
  [AccountAction.Claim]: 'Аккаунт закреплён',
  [AccountAction.Profile]: 'Сохранено',
  [AccountAction.Avatar]: 'Аватар обновлён',
};

export default class LobbyState {
  private readonly client: WsClient<Player>;
  private readonly onEnterGame: (roomId: string) => void;
  private ui!: LobbyUI;
  private unsubs: Unsubscribe[] = [];
  private profile: ProfileDialog | null = null;
  private channelDialog: ChannelDialog | null = null;
  private createChannelDialog: CreateChannelDialog | null = null;

  /** The games portal page shown in place of the chat (null = the chat). */
  private portal: PortalUI | null = null;
  private portalRoute: PortalRoute | null = null;
  /** What the portal last drew (to redraw only when it changes — presence is chatty). */
  private portalDrawn = '';
  /** The game being played (we are in its room). */
  private host: GameHost | null = null;
  /** A game page opened before the catalog arrived: its view is reported once it does. */
  private pendingView: { slug: string; source: ViewSource } | null = null;
  /** How each game's page was last reached — the launch is attributed to it. */
  private readonly viewSources = new Map<string, ViewSource>();
  /** After a reconnect: the game room we are getting back into (the game keeps running). */
  private rejoiningGame: string | null = null;
  /** Called when an unnamed visitor asks to enter (the entry form). */
  private readonly onSignIn: (() => void) | null;
  /** Our API tokens while the profile is open (null = not loaded / not offered). */
  private apiTokens: ApiToken[] | null = null;
  private newApiToken = '';
  private apiTokensRequested = false;
  /** The address bar (tests replace it before `enter()`). */
  nav: PortalNavigation = browserNavigation();

  /** Notifications on this device (the profile dialog's switch); absent in tests. */
  private readonly alerts: ChatAlerts | null;
  /** Voice chat (owned by App, outlives this state); absent in tests. */
  private readonly voice: VoiceChat<Player> | null;
  private readonly updates: UpdateChecker | null;

  constructor(
    client: WsClient<Player>,
    onEnterGame: (roomId: string) => void,
    alerts: ChatAlerts | null = null,
    voice: VoiceChat<Player> | null = null,
    updates: UpdateChecker | null = null,
    onSignIn: (() => void) | null = null
  ) {
    this.onSignIn = onSignIn;
    this.client = client;
    this.onEnterGame = onEnterGame;
    this.alerts = alerts;
    this.voice = voice;
    this.updates = updates;
  }

  /** Show `roomId` (a clicked notification), unless it is already shown or a game room. */
  openRoom(roomId: string): void {
    const room = this.client.roomManager.getRoom(roomId);
    if (!room || room.supportsMode(CommunicationMode.Spatial)) return;
    if (this.ui.getCurrentRoomId() !== roomId) this.requestJoin(roomId);
  }

  enter(): void {
    // Build the UI here (not in the constructor) so the outgoing state has already
    // torn down its own DOM by the time transitionTo() calls enter().
    this.ui = new LobbyUI();
    this.ui.setOnMessageCallback(message => this.client.sendChatMessageRequest(message));
    this.ui.setOnRoomJoinCallback(roomId => {
      this.closePortal();
      this.requestJoin(roomId);
    });
    this.ui.setOnGamesCallback(() => this.openPortal({ kind: 'catalog' }));
    this.ui.setOnPlayCallback(roomId => {
      // Banned there: the server would refuse the join; say so instead of loading the game.
      if (this.client.permissions.isBanned(this.client.subject, roomId))
        this.ui.addSystemMessage(`Вы заблокированы в канале «${this.roomName(roomId)}»`);
      else this.onEnterGame(roomId);
    });
    this.ui.setOnLoadOlderCallback(() => this.loadOlder());
    this.ui.setOnProfileCallback(() => {
      if (this.client.isAnonymous) this.onSignIn?.();
      else this.openProfile();
    });
    this.ui.setOnDeleteMessageCallback(id => this.deleteMessage(id));
    this.ui.setOnManageChannelCallback(() => this.openChannelDialog());
    this.ui.setOnManageMemberCallback(userId => this.openChannelDialog()?.openMember(userId));
    this.ui.setOnCreateChannelCallback(() => this.openCreateChannel());
    this.ui.setOnVoiceJoinCallback(roomId => this.joinVoice(roomId));
    this.ui.setOnVoiceControlCallback(control => this.voiceControl(control));

    this.unsubs.push(
      this.client.on('roomList', () => {
        this.renderRooms();
        this.updateChannelControls(); // a channel may have been renamed, closed or deleted
      }),
      this.client.on('roomJoined', roomId => this.handleRoomJoined(roomId)),
      this.client.on('roomJoinFailed', (roomId, error) => this.handleJoinFailed(roomId, error)),
      this.client.on('playerName', (id, name) => this.handlePlayerName(id, name)),
      this.client.on('roomUsers', (msg: RoomUsersUpdateEvent) => this.handleRoomUsersUpdate(msg)),
      this.client.on('chat', (roomId, entry) => this.handleChat(roomId, entry)),
      this.client.on('chatHistory', (roomId, change) => this.handleChatHistory(roomId, change)),
      this.client.on('games', () => this.handleGames()),
      this.client.on('presence', () => {
        this.renderPortal(); // who is playing what
        this.ui.setAnonymous(this.client.isAnonymous);
        this.refreshRoles();
        // Became a server admin with the profile open (claimed an admin login): tokens too.
        if (this.profile && this.apiTokens === null && this.client.subject?.isAdmin)
          this.requestApiTokens();
        this.profile?.update(this.profileView());
        if (this.client.voiceRoster.size > 0) this.renderRooms(); // names / pictures in voice
      }),
      this.client.on('voiceRoster', () => this.renderRooms()),
      this.client.on('permissions', () => this.refreshRoles()),
      this.client.on('chatDeleted', (roomId, messageId) => {
        if (roomId === this.ui.getCurrentRoomId()) this.ui.removeMessage(messageId);
      }),
      this.client.on('moderation', result => this.handleModeration(result)),
      this.client.on('account', result => this.handleAccount(result)),
      this.client.on('apiTokens', result => {
        this.apiTokens = result.tokens;
        if (result.newToken) this.newApiToken = result.newToken;
        this.profile?.update(this.profileView());
        if (result.error === 'limit')
          this.profile?.showStatus('tokens', 'Слишком много токенов — отзовите ненужные', true);
        else if (result.error === 'forbidden')
          this.profile?.showStatus('tokens', 'Токены доступны только администраторам', true);
      })
    );
    if (this.updates) {
      const updates = this.updates;
      this.ui.setUpdateAvailable(updates.updateAvailable);
      this.unsubs.push(updates.onUpdate(() => this.ui.setUpdateAvailable(true)));
    }
    if (this.alerts)
      this.unsubs.push(this.alerts.onStatusChange(() => this.profile?.update(this.profileView())));
    if (this.voice) this.unsubs.push(this.voice.on('change', () => this.renderVoice()));

    // Rooms may already be known (coming back from the game).
    this.renderRooms();
    this.renderVoice();

    // The games portal: the page the address names (a shared /games/{slug} link, a
    // reload), and back / forward between its pages.
    this.unsubs.push(this.nav.onPop(this.onPopState));
    this.ui.setAnonymous(this.client.isAnonymous);
    const route = routeFromPath(this.nav.path());
    if (route) this.openPortal(route, false, 'link');
    this.renderGamesNav();
  }

  /**
   * First connect / reconnect: the server places every new connection in its home
   * room (the lobby) by itself and confirms it with `roomJoined` — nothing to send.
   * Coming back from the game (already connected): ask to return to that home room;
   * the game room's avatar and players go away once the server confirms.
   */
  onSessionInit(): void {
    this.ui.setCurrentUserId(this.client.clientId, this.client.myPlayerName);
    this.ui.setAnonymous(this.client.isAnonymous);
    this.renderMembers(); // the roster may already be known (coming back from the game)
    if (this.host) {
      // A reconnect while playing: back into the game's room; the game itself never
      // stopped (the server's own lobby join, which comes first, must not stop it).
      this.rejoiningGame = this.host.game.roomId;
      this.requestJoin(this.host.game.roomId);
      return;
    }
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
    this.stopGame();
    this.closeProfile();
    this.closeChannelDialog();
    this.closeCreateChannel();
    this.ui.destroy();
  }

  private requestJoin(roomId: string): void {
    this.ui.setPendingRoom(roomId);
    this.client.joinRoom(roomId);
  }

  private handleRoomJoined(roomId: string): void {
    const game = this.client.gameByRoom(roomId);
    if (game?.playUrl) {
      this.rejoiningGame = null;
      this.startGame(game);
    } else if (this.rejoiningGame && roomId === this.client.homeRoomId) {
      // The server's automatic lobby join after a reconnect: the game room is next.
    } else {
      this.rejoiningGame = null;
      this.stopGame();
    }
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
    if (switched && this.channelDialog?.roomId !== roomId) this.closeChannelDialog();
    this.renderMembers();
    this.renderRooms();
    this.updateChannelControls();
  }

  // ==================== chat ====================

  private toMessage = (entry: ChatEntry): LobbyMessage => ({
    id: entry.id,
    name: entry.name,
    text: entry.text,
    sentAtMs: entry.sentAtMs,
    own: this.client.isOwnMessage(entry),
    userId: entry.userId,
    ...this.authorOf(entry.userId),
    canDelete: this.canDelete(entry.userId),
  });

  /** What a message shows about its author in the current channel. */
  private authorOf(userId: number): {
    avatarUrl: string | null;
    login: string | null;
    role: string | null;
  } {
    const user = this.client.presence.get(userId);
    const roomId = this.ui.getCurrentRoomId();
    return {
      avatarUrl: this.client.avatarUrl(user),
      login: user?.login ?? null,
      role: roomId
        ? this.client.permissions.roleLabel(this.client.subjectOf(userId), roomId)
        : null,
    };
  }

  private canDelete(authorId: number): boolean {
    const roomId = this.ui.getCurrentRoomId();
    return roomId !== null && this.client.canDeleteIn(roomId, authorId);
  }

  private deleteMessage(messageId: number): void {
    const roomId = this.ui.getCurrentRoomId();
    if (!roomId || !window.confirm('Удалить сообщение? Его не увидит никто.')) return;
    this.client.deleteMessage(roomId, messageId);
  }

  /**
   * Presence or roles changed: everything that shows them follows — the member list,
   * the authors of rendered messages (avatar, @login, role, delete button), the channel
   * controls and the channel dialog.
   */
  private refreshRoles(): void {
    this.renderMembers();
    this.ui.refreshMessages(
      userId => this.authorOf(userId),
      userId => this.canDelete(userId)
    );
    this.updateChannelControls();
  }

  // The management button, the composer (muted / banned) and an open channel dialog.
  private updateChannelControls(): void {
    const roomId = this.ui.getCurrentRoomId();
    if (!roomId) return;
    const me = this.client.subject;
    const permissions = this.client.permissions;
    this.ui.setCanManageChannel(permissions.canManage(me, roomId));
    this.ui.setCanCreateChannel(me?.isAdmin ?? false);

    let blocked: string | null = null;
    if (this.client.isAnonymous) {
      blocked = 'Войдите, чтобы писать в чат';
    } else if (!this.client.canSendIn(roomId)) {
      const restriction = me && permissions.restriction(roomId, me.userId);
      blocked = restriction
        ? `Вам запрещено писать в этом канале ${formatUntil(restriction.untilMs)}`
        : 'В этом канале писать могут только администраторы';
    }
    this.ui.setComposerBlocked(blocked);

    if (this.channelDialog) {
      const shown = this.channelDialog.roomId;
      if (permissions.canManage(me, shown) && this.client.roomManager.getRoom(shown))
        this.channelDialog.update(this.channelView(shown));
      else this.closeChannelDialog(); // our rights were taken away, or the channel is gone
    }
    if (this.createChannelDialog && !me?.isAdmin) this.closeCreateChannel();
  }

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
    if (roomId === this.rejoiningGame) {
      // The game went back to a draft (or we were banned) while we were away.
      this.rejoiningGame = null;
      this.stopGame();
    }
    const name = this.roomName(roomId);
    if (error === 'banned') this.ui.addSystemMessage(`Вы заблокированы в канале «${name}»`);
    else if (error === 'no_access')
      this.ui.addSystemMessage(`Канал «${name}» закрыт — нужен доступ от администратора`);
    else this.ui.addSystemMessage(`Could not join ${name}: ${error}`);
  }

  private roomName(roomId: string): string {
    return this.client.roomManager.getRoom(roomId)?.name ?? roomId;
  }

  private renderRooms(): void {
    const client = this.client;
    this.ui.setRooms(
      client.roomManager.getAllRooms().map(room => ({
        id: room.id,
        name: room.name,
        hidden: client.gameByRoom(room.id) !== undefined,
        userCount: room.userCount,
        playable: room.supportsMode(CommunicationMode.Spatial),
        isPrivate: room.isPrivate,
        isVoice: room.supportsMode(CommunicationMode.VoiceChat),
        voice: client.voiceParticipants(room.id).map(p => {
          const user = client.presence.get(p.userId);
          return {
            clientId: p.clientId,
            name: user?.name ?? `User ${p.userId}`,
            avatarUrl: client.avatarUrl(user),
            isSelf: p.clientId === client.clientId,
            muted: p.muted,
            deafened: p.deafened,
          };
        }),
      }))
    );
    if (this.voice) this.ui.setVoiceSpeaking(this.voice.speaking);
  }

  // ==================== voice ====================

  private renderVoice(): void {
    const voice = this.voice;
    if (!voice) return;
    const roomId = voice.roomId;
    this.ui.setVoice(
      {
        status: voice.status,
        roomName: roomId ? this.roomName(roomId) : null,
        muted: voice.muted,
        deafened: voice.deafened,
        error: voice.error ? describeVoiceError(voice.error) : null,
      },
      roomId
    );
    this.ui.setVoiceSpeaking(voice.speaking);
  }

  private joinVoice(roomId: string): void {
    if (!this.voice) return;
    // Banned there: the server would refuse; say so without asking for the microphone.
    if (this.client.permissions.isBanned(this.client.subject, roomId)) {
      this.ui.addSystemMessage(`Вы заблокированы в канале «${this.roomName(roomId)}»`);
      return;
    }
    void this.voice.join(roomId);
  }

  private voiceControl(control: VoiceControl): void {
    const voice = this.voice;
    if (!voice) return;
    switch (control) {
      case 'mute':
        voice.toggleMute();
        break;
      case 'deafen':
        voice.toggleDeafen();
        break;
      case 'leave':
        voice.leave();
        break;
      case 'dismiss':
        voice.error = null;
        this.renderVoice();
        break;
    }
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

    const roomId = room?.id ?? null;
    const me = client.subject;
    const canManage = roomId !== null && client.permissions.canManage(me, roomId);
    for (const user of client.presence.values()) {
      const restriction = roomId ? client.permissions.restriction(roomId, user.userId) : undefined;
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
        avatarUrl: client.avatarUrl(user),
        about: user.about,
        userId: user.userId,
        login: user.login,
        role: roomId ? client.permissions.roleLabel(user, roomId) : null,
        manageable: canManage && user.userId !== client.myUserId,
        restriction: restriction ? describeRestriction(restriction) : null,
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

  // ==================== profile ====================

  private profileView(): ProfileView {
    const me = this.client.me;
    return {
      name: me?.name ?? this.client.myPlayerName,
      about: me?.about ?? '',
      avatarUrl: this.client.avatarUrl(me),
      login: this.client.myLogin,
      identified: me !== undefined,
      isAdmin: me?.isAdmin ?? false,
      notifications: this.alerts?.status ?? 'unsupported',
      apiTokens: me?.isAdmin ? this.apiTokens : null,
      newApiToken: this.newApiToken,
    };
  }

  // ==================== channel management ====================

  private channelView(roomId: string): ChannelDialogView {
    const client = this.client;
    const permissions = client.permissions;
    const me = client.subject;
    const users = [...client.presence.values()].map(user => {
      const admin = permissions.admin(roomId, user.userId);
      const restriction = permissions.restriction(roomId, user.userId);
      return {
        userId: user.userId,
        name: user.name,
        login: user.login,
        avatarUrl: client.avatarUrl(user),
        isServerAdmin: user.isAdmin,
        admin: admin ? { rights: admin.rights, title: admin.title } : null,
        restriction: restriction
          ? { denied: restriction.denied, banned: restriction.banned, untilMs: restriction.untilMs }
          : null,
        hasAccess: permissions.hasAccess(roomId, user.userId),
        isSelf: user.userId === client.myUserId,
      };
    });
    const room = client.roomManager.getRoom(roomId);
    return {
      roomId,
      roomName: room?.name ?? roomId,
      isHomeRoom: roomId === client.homeRoomId,
      isCreated: room?.isCreated ?? false,
      isPrivate: room?.isPrivate ?? permissions.channel(roomId).isPrivate,
      myRights: permissions.rightsOf(me, roomId),
      iAmServerAdmin: me?.isAdmin ?? false,
      defaults: permissions.channel(roomId).defaults,
      users,
      channels: client.roomManager
        .getAllRooms()
        .filter(room => permissions.canManage(me, room.id))
        .map(room => ({ id: room.id, name: room.name })),
    };
  }

  /** Opens (or returns the already open) management dialog of the current channel. */
  private openChannelDialog(): ChannelDialog | null {
    const roomId = this.ui.getCurrentRoomId();
    if (!roomId || !this.client.permissions.canManage(this.client.subject, roomId)) return null;
    if (this.channelDialog?.roomId === roomId) return this.channelDialog;
    this.closeChannelDialog();
    const client = this.client;
    // The channel shown right now: the dialog can switch to another one.
    const shown = () => this.channelDialog?.roomId ?? roomId;
    this.channelDialog = new ChannelDialog(this.channelView(roomId), {
      onSetDefaults: defaults => client.setChannelDefaults(shown(), defaults),
      onSetAdmin: (userId, rights, title) => client.setChannelAdmin(shown(), userId, rights, title),
      onRestrict: (userId, denied, banned, seconds) =>
        client.restrictMember(shown(), userId, denied, banned, seconds),
      onSetServerAdmin: (userId, isAdmin) => client.setServerAdmin(userId, isAdmin),
      onSetAccess: (userId, hasAccess) => client.setChannelAccess(shown(), userId, hasAccess),
      onUpdateChannel: (name, isPrivate) => client.updateChannel(shown(), name, isPrivate),
      onDeleteChannel: () => client.deleteChannel(shown()),
      onSwitchChannel: id => {
        if (client.permissions.canManage(client.subject, id))
          this.channelDialog?.update(this.channelView(id));
      },
      onClose: () => this.closeChannelDialog(),
    });
    return this.channelDialog;
  }

  private closeChannelDialog(): void {
    this.channelDialog?.destroy();
    this.channelDialog = null;
  }

  private openCreateChannel(): void {
    if (this.createChannelDialog || !this.client.subject?.isAdmin) return;
    this.createChannelDialog = new CreateChannelDialog({
      onCreate: (name, isPrivate, isVoice) => this.client.createChannel(name, isPrivate, isVoice),
      onClose: () => this.closeCreateChannel(),
    });
  }

  private closeCreateChannel(): void {
    this.createChannelDialog?.destroy();
    this.createChannelDialog = null;
  }

  private handleModeration(result: ModerationResult): void {
    switch (result.action) {
      case ModerationAction.SendMessage:
      case ModerationAction.DeleteMessage:
        // Refused chat actions are told in the chat itself.
        if (!result.success) this.ui.addSystemMessage(describeModerationError(result.error));
        return;
      case ModerationAction.CreateChannel:
        if (!result.success) {
          this.createChannelDialog?.showStatus(describeModerationError(result.error), true);
          return;
        }
        // Created: go there (the room list announcing it has already arrived).
        this.closeCreateChannel();
        if (result.roomId) this.requestJoin(result.roomId);
        return;
      case ModerationAction.DeleteChannel:
        if (result.success) {
          this.closeChannelDialog();
          this.ui.addSystemMessage('Канал удалён');
          return;
        }
        break;
    }
    if (!this.channelDialog) return;
    if (result.success) this.channelDialog.showStatus(MODERATION_DONE[result.action] ?? 'Готово');
    else this.channelDialog.showStatus(describeModerationError(result.error), true);
  }

  private openProfile(): void {
    if (this.profile) return;
    this.apiTokens = null;
    this.apiTokensRequested = false;
    this.newApiToken = '';
    if (this.client.subject?.isAdmin) this.requestApiTokens();
    this.profile = new ProfileDialog(this.profileView(), {
      onSave: (name, about) => {
        // The name is renamed through the usual request (it is announced by presence);
        // "about" is the one that is answered — and rate-limited — as a profile change.
        const view = this.profileView();
        if (name !== view.name) this.client.rename(name);
        if (about !== view.about) this.client.setAbout(about);
        else this.profile?.showStatus('profile', 'Сохранено');
      },
      onAvatarPicked: file => void this.uploadAvatar(file),
      onAvatarRemoved: () => this.client.setAvatar(null),
      onClaim: (login, password) => {
        this.profile?.showStatus('account', '');
        this.client.claimAccount(login, password);
      },
      onLogout: () => this.client.logout(),
      onNotifications: on => {
        if (!this.alerts) return;
        if (on) {
          void this.alerts.enable().then(status => {
            if (status === 'denied')
              this.profile?.showStatus('notifications', 'Браузер запретил уведомления', true);
          });
        } else void this.alerts.disable();
      },
      onSwitchAccount: () => {
        // Back to the entry form in login mode. The guest key stays stored, so backing
        // out of the form (or a refused login) returns to this guest.
        location.hash = '#login';
        location.reload();
      },
      onCreateApiToken: name => this.client.createApiToken(name),
      onRevokeApiToken: id => this.client.revokeApiToken(id),
      onClose: () => this.closeProfile(),
    });
  }

  // ==================== games portal ====================

  private readonly onPopState = (): void => {
    const route = routeFromPath(this.nav.path());
    if (route) this.openPortal(route, false, 'nav');
    else this.closePortal(false);
  };

  /**
   * Show a portal page in place of the chat (`push`: as a new history entry). Opening
   * the portal while playing leaves the game: one room at a time.
   */
  private openPortal(route: PortalRoute, push = true, source?: ViewSource): void {
    if (this.host) this.leaveGame();
    if (route.kind === 'game' && source) this.reportView(route.slug, source);
    this.portalRoute = route;
    if (push && this.nav.path() !== pathOf(route)) this.nav.push(pathOf(route));
    this.portal ??= new PortalUI({
      onOpen: slug => this.openPortal({ kind: 'game', slug }, true, 'catalog'),
      onBack: () => this.openPortal({ kind: 'catalog' }),
      onPlay: game => this.play(game),
    });
    this.portalDrawn = '';
    this.renderPortal();
    this.ui.setPortal(this.portal.element);
    this.renderGamesNav();
  }

  /** Back to the chat; the address leaves /games (`push`: as a new history entry). */
  private closePortal(push = true): void {
    if (!this.portalRoute) return;
    this.portalRoute = null;
    this.ui.setPortal(null);
    if (push && routeFromPath(this.nav.path())) this.nav.push('/');
    this.renderGamesNav();
  }

  /** A game's page was opened: counted by the server (not for the game's own people). */
  private reportView(slug: string, source: ViewSource): void {
    const game = this.client.games.find(g => g.slug === slug);
    if (!game) {
      this.pendingView = this.client.gamesLoaded ? null : { slug, source };
      return;
    }
    this.pendingView = null;
    this.viewSources.set(game.id, source);
    this.client.sendGameViewRequest(game.id, source, this.visitorId());
  }

  /** Our anonymous visitor id — only while we are nobody (an identified user is itself). */
  private visitorId(): string {
    return this.client.isAnonymous ? loadOrCreateVisitorId() : '';
  }

  private handleGames(): void {
    if (this.pendingView) this.reportView(this.pendingView.slug, this.pendingView.source);
    this.renderGamesNav();
    this.renderPortal();
    this.renderRooms(); // a game room is not a channel
    const host = this.host;
    if (!host) return;
    const game = this.client.games.find(g => g.id === host.game.id);
    // Gone from the catalog = no longer ours to see; the server moves us out of its room.
    if (game) host.setUpdateAvailable(!!game.playUrl && game.playUrl !== host.game.playUrl);
  }

  private renderGamesNav(): void {
    this.ui.setGamesNav(
      this.client.gamesLoaded,
      this.client.games.filter(g => g.isPublic).length,
      this.portalRoute !== null
    );
  }

  private cardOf(game: PortalGame): PortalCard {
    const playing = [...this.client.presence.values()]
      .filter(u => u.roomId === game.roomId && u.status !== PresenceStatus.Offline)
      .map(u => ({ userId: u.userId, name: u.name, avatarUrl: this.client.avatarUrl(u) }));
    return { game, playing };
  }

  private renderPortal(): void {
    const portal = this.portal;
    const route = this.portalRoute;
    if (!portal || !route) return;
    let cards: PortalCard[];
    if (route.kind === 'catalog') cards = this.client.games.map(g => this.cardOf(g));
    else {
      const game = this.client.games.find(g => g.slug === route.slug);
      cards = game ? [this.cardOf(game)] : [];
    }
    const drawn = JSON.stringify([route, this.client.gamesLoaded, cards]);
    if (drawn === this.portalDrawn) return;
    this.portalDrawn = drawn;
    if (route.kind === 'catalog') portal.showCatalog(cards);
    else if (cards.length || this.client.gamesLoaded) portal.showGame(cards[0] ?? null);
  }

  private play(game: PortalGame): void {
    if (!game.playUrl) return;
    if (this.client.permissions.isBanned(this.client.subject, game.roomId)) {
      this.ui.addSystemMessage(`Вы заблокированы в комнате игры «${game.title}»`);
      return;
    }
    this.requestJoin(game.roomId); // the game starts once the server confirms
  }

  /** In the game's room now: put the game on the stage (unless it already is, as it was). */
  private startGame(game: PortalGame): void {
    if (this.host?.game.id === game.id && this.host.game.playUrl === game.playUrl) return;
    this.stopGame();
    this.host = new GameHost(game, {
      onLeave: () => this.leaveGame(true),
      onRestart: () => {
        const latest = this.client.games.find(g => g.id === game.id);
        if (latest?.playUrl) this.startGame(latest);
      },
      onToggleChat: () => this.ui.togglePlayingChat(),
      play: this.playReporter(game),
    });
    this.ui.setGameStage(this.host.element);
    this.closePortal(false);
    const path = pathOf({ kind: 'game', slug: game.slug });
    if (this.nav.path() !== path) this.nav.replace(path);
  }

  /** One play session's reporting: its id, the game, the release, where the player came from. */
  private playReporter(game: PortalGame) {
    const sessionId = newSessionId();
    const source = this.viewSources.get(game.id) ?? 'catalog';
    const device = deviceClass();
    return {
      sendBeat: (activeMs: number, ended: boolean) =>
        this.client.sendGamePlayBeatRequest({
          gameId: game.id,
          sessionId,
          releaseNo: game.releaseNo,
          activeMs,
          device,
          source,
          visitorId: this.visitorId(),
          ended,
        }),
      sendEvents: (events: { name: string; level: string; params: string }[]) =>
        this.client.sendGamePlayEventsRequest(sessionId, events),
    };
  }

  private stopGame(): void {
    if (!this.host) return;
    this.host.destroy();
    this.host = null;
    this.ui.setGameStage(null);
  }

  /** Leave the game (its room); `showPage`: then show the game's page. */
  private leaveGame(showPage = false): void {
    const game = this.host?.game;
    this.stopGame();
    this.rejoiningGame = null;
    if (this.client.homeRoomId) this.requestJoin(this.client.homeRoomId);
    if (showPage && game) this.openPortal({ kind: 'game', slug: game.slug }, false);
  }

  private requestApiTokens(): void {
    if (this.apiTokensRequested) return;
    this.apiTokensRequested = true;
    this.client.listApiTokens();
  }

  private closeProfile(): void {
    this.profile?.destroy();
    this.profile = null;
    this.newApiToken = ''; // shown once
  }

  private async uploadAvatar(file: File): Promise<void> {
    const dialog = this.profile;
    dialog?.showStatus('avatar', 'Загрузка…');
    try {
      const image = await prepareAvatar(file);
      this.client.setAvatar(image);
    } catch {
      if (this.profile === dialog)
        dialog?.showStatus('avatar', 'Не удалось прочитать изображение', true);
    }
  }

  private handleAccount(result: AccountResult): void {
    if (!this.profile) return;
    const section = ACCOUNT_SECTIONS[result.action];
    if (result.success) {
      this.profile.update(this.profileView()); // a claim turns the form into "claimed"
      this.profile.showStatus(section, ACCOUNT_DONE[result.action] ?? '');
    } else {
      const text = ACCOUNT_ERRORS[result.error ?? ''] ?? 'Не получилось. Попробуйте ещё раз';
      this.profile.showStatus(section, text, true);
    }
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
