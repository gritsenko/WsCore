import styles from './LobbyUI.css?inline';

const svg = (body: string, size = 20): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Static inline icons (trusted markup — never interpolate user data into these). */
const ICONS = {
  logo:
    '<svg width="44" height="18" viewBox="0 0 44 18" fill="currentColor" aria-hidden="true">' +
    '<path d="M0 9c4 0 5-7 10.5-7S17 9 22 9s6-7 11.5-7S40 9 44 9c-4 0-5 7-10.500 7S27 9 22 9s-6 7-11.500 7S4 9 0 9z"/></svg>',
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.600-3.600"/>', 18),
  lobby: svg('<path d="M9 4 7 20M17 4l-2 16M4 9h17M3 15h17"/>'),
  voice: svg('<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>'),
  game: svg(
    '<path d="M7 7h10a5 5 0 0 1 4.900 4l.900 4.500a2.500 2.500 0 0 1-4.400 2L16.500 15h-9l-1.900 2.500a2.500 2.500 0 0 1-4.400-2L2.100 11A5 5 0 0 1 7 7z"/>' +
      '<path d="M7.500 10v3M6 11.500h3M15.500 10.500h.010M17.500 12.500h.010"/>'
  ),
  send: svg('<path d="M21 3 10.500 13.500M21 3l-6.500 18-4-7.500L3 9.500 21 3z"/>'),
  settings: svg(
    '<circle cx="12" cy="12" r="3"/><path d="M19.400 15a1.700 1.700 0 0 0 .300 1.800l.100.100a2 2 0 1 1-2.800 2.800l-.100-.100a1.700 1.700 0 0 0-2.800 1.200V21a2 2 0 1 1-4 0v-.100a1.700 1.700 0 0 0-2.900-1.200l-.100.100a2 2 0 1 1-2.800-2.800l.100-.100a1.700 1.700 0 0 0-1.200-2.800H3a2 2 0 1 1 0-4h.100a1.700 1.700 0 0 0 1.200-2.900l-.100-.100a2 2 0 1 1 2.800-2.800l.100.100a1.700 1.700 0 0 0 2.800-1.200V3a2 2 0 1 1 4 0v.100a1.700 1.700 0 0 0 2.900 1.200l.100-.100a2 2 0 1 1 2.800 2.800l-.100.100a1.700 1.700 0 0 0 1.200 2.800H21a2 2 0 1 1 0 4h-.100a1.700 1.700 0 0 0-1.500 1.100z"/>',
    18
  ),
};

const ROOM_ICONS: Record<string, string> = {
  lobby: ICONS.lobby,
  voice: ICONS.voice,
  game: ICONS.game,
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A user's avatar: their picture if they set one, otherwise initials on a tint derived
 * from the name (so a user looks the same everywhere). The initials stay underneath the
 * picture — they are what shows while it loads, or if it fails to.
 */
export function createAvatar(
  name: string,
  size: 'sm' | 'md' | 'lg',
  status?: 'online' | 'away' | 'offline',
  imageUrl?: string | null
): HTMLDivElement {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  // Spread near-identical names ("Player 11" / "Player 12") far apart on the hue wheel.
  const hue = Math.abs(Math.imul(hash, 0x9e3779b1) >> 8) % 360;

  const words = name.trim().split(/\s+/).filter(Boolean);
  const last = [...(words[words.length - 1] ?? '')];
  const initials =
    words.length > 1
      ? // "Player 12" -> "P2": for a numeric tail the last digit is the distinguishing one
        [...words[0]][0] + (/^\d+$/.test(last.join('')) ? last[last.length - 1] : last[0])
      : [...(words[0] ?? '?')].slice(0, 2).join('');

  const avatar = el(
    'div',
    `lobby-avatar lobby-avatar-${size}${status ? ` lobby-avatar-${status}` : ''}`,
    initials.toUpperCase()
  );
  avatar.style.background = `hsl(${hue} 22% 26%)`;
  avatar.style.color = `hsl(${hue} 45% 82%)`;

  if (imageUrl) {
    const image = el('img', 'lobby-avatar-img');
    image.alt = '';
    image.decoding = 'async';
    image.onerror = () => image.remove();
    image.src = imageUrl;
    avatar.appendChild(image);
  }
  return avatar;
}

/** "14:05" for today, "12 нояб., 14:05" for any other day (history spans days). */
function formatMessageTime(sentAtMs: number): string {
  const date = new Date(sentAtMs);
  const time = date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  if (date.toDateString() === new Date().toDateString()) return time;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${time}`;
}

/** A chat message as the lobby displays it. */
export interface LobbyMessage {
  id: number;
  name: string;
  text: string;
  sentAtMs: number;
  own: boolean;
  /** The author's user id (0 = anonymous); lets avatars be refreshed in place. */
  userId: number;
  /** The author's avatar image, if they have one (and are still in the member list). */
  avatarUrl?: string | null;
}

/** An entry of the member list. Users stay listed when they leave — as offline. */
export interface LobbyMember {
  /** Stable key (user or guest connection). */
  key: string;
  name: string;
  status: 'online' | 'away' | 'offline';
  isSelf: boolean;
  /** Secondary line: another room's name, "отошёл", "был(а) 5 мин назад"… */
  detail?: string;
  avatarUrl?: string | null;
  /** "About me" text, shown in the user's card. */
  about?: string;
}

/** A room as the lobby displays it (the list itself comes from the server). */
export interface LobbyRoom {
  id: string;
  name: string;
  userCount: number;
  /** A spatial (3D game) room: shows a Play button, and clicking it enters the game. */
  playable: boolean;
}

/**
 * Lobby UI: sidebar (brand, rooms, member list, current user) + room chat.
 *
 * Purely presentational: it renders the messages and members it is given. The chat
 * list is windowed by the caller's log (history pages are prepended as the user scrolls
 * up) and never re-renders on a single new message.
 */
export default class LobbyUI {
  private container: HTMLDivElement | null = null;
  private usersList: HTMLDivElement | null = null;
  private usersCount: HTMLSpanElement | null = null;
  private chatMessages: HTMLDivElement | null = null;
  private chatInput: HTMLInputElement | null = null;
  private roomsList: HTMLDivElement | null = null;
  private headerTitle: HTMLSpanElement | null = null;
  private headerOnline: HTMLDivElement | null = null;
  private meSection: HTMLDivElement | null = null;
  private userSearchInput: HTMLInputElement | null = null;
  private messageCallback: ((message: string) => void) | null = null;
  private roomJoinCallback: ((roomId: string) => void) | null = null;
  private playCallback: ((roomId: string) => void) | null = null;
  private members: LobbyMember[] = [];
  private loadOlderCallback: (() => void) | null = null;
  private profileCallback: (() => void) | null = null;
  /** The profile card of a member (opened by clicking them in the list). */
  private userCard: HTMLDivElement | null = null;
  /** Top row of the message list: "loading…" while older history exists, else its start. */
  private historyStatus: HTMLDivElement | null = null;
  private newMessagesButton: HTMLButtonElement | null = null;
  private hasMoreHistory = false;
  private loadingHistory = false;
  private rooms: Map<string, LobbyRoom> = new Map();
  private currentUserId: number = -1;
  private currentUserName: string | null = null;
  private currentRoomId: string | null = null;
  /** Room whose join is awaiting the server's answer (shown as "Joining…"). */
  private pendingRoomId: string | null = null;
  /** Within this distance of the bottom the list follows new messages. */
  private static readonly STICK_TO_BOTTOM_PX = 80;
  /** Scrolling this close to the top asks for the previous history page. */
  private static readonly LOAD_OLDER_PX = 300;
  private userFilter = '';
  private messageFilter = '';
  private static cssLoaded = false;

  private readonly onGlobalKeyDown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.userSearchInput?.focus();
    } else if (e.key === 'Escape') {
      this.closeUserCard();
    }
  };

  // A click anywhere else closes the open user card.
  private readonly onGlobalPointerDown = (e: PointerEvent): void => {
    if (this.userCard && !this.userCard.contains(e.target as Node)) this.closeUserCard();
  };

  constructor() {
    if (!LobbyUI.cssLoaded) {
      LobbyUI.loadCSS();
      LobbyUI.cssLoaded = true;
    }
    this.initializeUI();
  }

  /**
   * Load the lobby CSS styles
   */
  private static loadCSS(): void {
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }

  private initializeUI(): void {
    this.container = el('div');
    this.container.id = 'lobby-container';

    this.container.appendChild(this.buildSidebar());
    this.container.appendChild(this.buildChatArea());

    document.body.appendChild(this.container);

    // Clear any default margins/padding
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', this.onGlobalKeyDown);
    document.addEventListener('pointerdown', this.onGlobalPointerDown);

    this.updateRoomsList();
    this.updateUsersList();
  }

  private buildSidebar(): HTMLDivElement {
    const sidebar = el('div', 'lobby-left-sidebar');

    const brand = el('div', 'lobby-brand');
    brand.innerHTML = ICONS.logo;
    brand.appendChild(el('span', 'lobby-brand-name', 'WAVE'));
    sidebar.appendChild(brand);

    const search = this.buildSearch('Поиск…', 'lobby-sidebar-search', value => {
      this.userFilter = value;
      this.updateUsersList();
    });
    this.userSearchInput = search.querySelector('input');
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    search.appendChild(el('kbd', undefined, isMac ? '⌘K' : 'Ctrl K'));
    sidebar.appendChild(search);

    const roomsSection = el('div', 'lobby-rooms-section');
    roomsSection.appendChild(el('div', 'lobby-rooms-title', 'Rooms'));
    this.roomsList = el('div', 'lobby-rooms-list');
    roomsSection.appendChild(this.roomsList);
    sidebar.appendChild(roomsSection);

    const usersSection = el('div', 'lobby-users-section');
    const usersTitle = el('div', 'lobby-users-title', 'Online');
    this.usersCount = el('span', 'lobby-users-title-count', '0');
    usersTitle.appendChild(this.usersCount);
    usersSection.appendChild(usersTitle);
    this.usersList = el('div', 'lobby-users-list');
    usersSection.appendChild(this.usersList);
    sidebar.appendChild(usersSection);

    // Our own entry; a click opens the profile (name, avatar, about, account).
    this.meSection = el('div', 'lobby-me');
    this.meSection.setAttribute('role', 'button');
    this.meSection.tabIndex = 0;
    this.meSection.title = 'Профиль';
    this.meSection.onclick = () => this.profileCallback?.();
    this.meSection.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.profileCallback?.();
      }
    };
    sidebar.appendChild(this.meSection);

    return sidebar;
  }

  private buildChatArea(): HTMLDivElement {
    const chatArea = el('div', 'lobby-chat-area');

    const header = el('div', 'lobby-chat-header');
    const heading = el('div');
    this.headerTitle = el('span', 'lobby-chat-header-title', 'Connecting…');
    this.headerOnline = el('div', 'lobby-chat-header-online', '0 online');
    heading.appendChild(this.headerTitle);
    heading.appendChild(this.headerOnline);
    header.appendChild(heading);
    header.appendChild(
      this.buildSearch('Поиск в комнате…', 'lobby-room-search', value => {
        this.messageFilter = value;
        this.applyMessageFilter();
      })
    );
    chatArea.appendChild(header);

    const messagesWrap = el('div', 'lobby-messages-wrap');
    this.chatMessages = el('div', 'lobby-messages');
    this.historyStatus = el('div', 'lobby-history-status');
    this.historyStatus.hidden = true;
    this.chatMessages.appendChild(this.historyStatus);
    this.chatMessages.addEventListener('scroll', this.onMessagesScroll, { passive: true });
    messagesWrap.appendChild(this.chatMessages);

    // Shown when a message arrives while the user is reading further up.
    this.newMessagesButton = el('button', 'lobby-new-messages', 'Новые сообщения ↓');
    this.newMessagesButton.type = 'button';
    this.newMessagesButton.hidden = true;
    this.newMessagesButton.onclick = () => this.scrollToBottom();
    messagesWrap.appendChild(this.newMessagesButton);
    chatArea.appendChild(messagesWrap);

    const inputContainer = el('div', 'lobby-input-container');
    this.chatInput = el('input', 'lobby-input');
    this.chatInput.type = 'text';
    this.chatInput.placeholder = 'Написать сообщение…';
    this.chatInput.onkeydown = e => {
      if (e.key === 'Enter' && !e.isComposing) {
        this.sendMessage();
      }
    };
    inputContainer.appendChild(this.chatInput);

    const sendBtn = el('button', 'lobby-send-btn');
    sendBtn.type = 'button';
    sendBtn.title = 'Отправить';
    sendBtn.setAttribute('aria-label', 'Отправить');
    sendBtn.innerHTML = ICONS.send;
    sendBtn.onclick = () => this.sendMessage();
    inputContainer.appendChild(sendBtn);

    chatArea.appendChild(inputContainer);
    return chatArea;
  }

  private buildSearch(
    placeholder: string,
    className: string,
    onChange: (value: string) => void
  ): HTMLLabelElement {
    const wrapper = el('label', `lobby-search ${className}`);
    wrapper.innerHTML = ICONS.search;
    const input = el('input');
    input.type = 'search';
    input.placeholder = placeholder;
    input.setAttribute('aria-label', placeholder);
    input.oninput = () => onChange(input.value.trim().toLowerCase());
    wrapper.appendChild(input);
    return wrapper;
  }

  /**
   * Set callback for when room is joined
   */
  setOnRoomJoinCallback(callback: (roomId: string) => void): void {
    this.roomJoinCallback = callback;
  }

  /**
   * Set callback for when the Play button is clicked (enter the 3D game).
   */
  setOnPlayCallback(callback: (roomId: string) => void): void {
    this.playCallback = callback;
  }

  /** Set callback for a click on our own entry (open the profile). */
  setOnProfileCallback(callback: () => void): void {
    this.profileCallback = callback;
  }

  /**
   * Update room list display
   */
  private updateRoomsList(): void {
    if (!this.roomsList) return;

    this.roomsList.innerHTML = '';

    for (const [roomId, room] of this.rooms) {
      const roomElement = el('div', 'lobby-room-item');
      if (roomId === this.currentRoomId) {
        roomElement.classList.add('lobby-room-current');
      }
      if (roomId === this.pendingRoomId) {
        roomElement.classList.add('lobby-room-pending');
      }

      const icon = el('span', 'lobby-room-icon');
      icon.innerHTML = ROOM_ICONS[roomId] ?? (room.playable ? ICONS.game : ICONS.lobby);
      roomElement.appendChild(icon);

      const roomContent = el('div', 'lobby-room-content');
      roomContent.appendChild(el('span', 'lobby-room-name', room.name));
      roomElement.appendChild(roomContent);

      const countBadge = el('span', 'lobby-room-count', room.userCount.toString());
      countBadge.dataset.empty = String(room.userCount === 0);
      countBadge.title = `${room.userCount} online`;
      roomElement.appendChild(countBadge);

      // Play button for game (spatial) rooms
      if (room.playable) {
        const playButton = el('button', 'lobby-play-btn', 'Play');
        playButton.type = 'button';
        playButton.onclick = e => {
          e.stopPropagation(); // Prevent triggering room join
          this.playCallback?.(roomId);
        };
        roomElement.appendChild(playButton);
      }

      // A game room is entered through the game (joining it gives you an avatar);
      // any other room is joined as a chat room.
      roomElement.onclick = () => {
        if (room.playable) {
          this.playCallback?.(roomId);
        } else if (this.roomJoinCallback && roomId !== this.currentRoomId) {
          this.roomJoinCallback(roomId);
        }
      };

      this.roomsList.appendChild(roomElement);
    }
  }

  /**
   * Replace the displayed room list (from the server's RoomListEvent).
   */
  setRooms(rooms: LobbyRoom[]): void {
    this.rooms = new Map(rooms.map(r => [r.id, { ...r }]));
    this.updateHeader();
    this.updateRoomsList();
  }

  /**
   * Replace the member list (already ordered by the caller): everyone online or away,
   * then the offline users.
   */
  setMembers(members: LobbyMember[]): void {
    this.members = members;
    this.updateUsersList();
  }

  /**
   * Set current user ID for message display
   */
  setCurrentUserId(userId: number, userName?: string): void {
    this.currentUserId = userId;
    this.currentUserName = userName || null;
    this.updateUsersList();
  }

  getCurrentRoomId(): string | null {
    return this.currentRoomId;
  }

  /**
   * Set the current room (server-confirmed). Clears any pending join.
   */
  setCurrentRoom(roomId: string): void {
    this.currentRoomId = roomId;
    this.pendingRoomId = null;
    this.updateHeader();
    this.updateRoomsList();
  }

  /**
   * Mark a join as in flight (or clear it with null) until the server answers.
   */
  setPendingRoom(roomId: string | null): void {
    this.pendingRoomId = roomId;
    this.updateHeader();
    this.updateRoomsList();
  }

  private updateHeader(): void {
    if (!this.headerTitle) return;
    const nameOf = (id: string) => this.rooms.get(id)?.name ?? id;
    if (this.pendingRoomId) this.headerTitle.textContent = `Joining ${nameOf(this.pendingRoomId)}…`;
    else if (this.currentRoomId) this.headerTitle.textContent = nameOf(this.currentRoomId);
    else this.headerTitle.textContent = 'Connecting…';

    // People in the room right now (the member list also shows who is elsewhere).
    const inRoom = this.currentRoomId ? (this.rooms.get(this.currentRoomId)?.userCount ?? 0) : 0;
    if (this.headerOnline) this.headerOnline.textContent = `${inRoom} online`;
  }

  /**
   * Update the member list display (+ the counters and the current-user footer)
   */
  private updateUsersList(): void {
    if (!this.usersList) return;

    this.usersList.innerHTML = '';

    const matches = (m: LobbyMember) => m.name.toLowerCase().includes(this.userFilter);
    const present = this.members.filter(m => m.status !== 'offline');
    const offline = this.members.filter(m => m.status === 'offline');
    const visiblePresent = present.filter(matches);
    const visibleOffline = offline.filter(matches);

    const list = document.createDocumentFragment();
    for (const member of visiblePresent) list.appendChild(this.buildMemberItem(member));
    if (visibleOffline.length > 0) {
      const title = el('div', 'lobby-users-title lobby-users-subtitle', 'Offline');
      title.appendChild(el('span', 'lobby-users-title-count', String(offline.length)));
      list.appendChild(title);
      for (const member of visibleOffline) list.appendChild(this.buildMemberItem(member));
    }
    this.usersList.appendChild(list);

    if (visiblePresent.length + visibleOffline.length === 0 && this.userFilter) {
      this.usersList.appendChild(el('div', 'lobby-users-empty', 'Никого не найдено'));
    }

    if (this.usersCount) this.usersCount.textContent = String(present.length);

    this.updateMeSection();
  }

  private buildMemberItem(member: LobbyMember): HTMLDivElement {
    const item = el('div', `lobby-user-item lobby-user-${member.status}`);
    if (member.isSelf) item.classList.add('lobby-current-user');
    item.appendChild(createAvatar(member.name, 'sm', member.status, member.avatarUrl));
    const text = el('div', 'lobby-user-text');
    text.appendChild(el('span', 'lobby-user-name', member.name));
    if (member.detail) text.appendChild(el('span', 'lobby-user-detail', member.detail));
    item.appendChild(text);
    item.onclick = () => this.openUserCard(member, item);
    return item;
  }

  /** The member's profile card (picture, name, status, about), next to their entry. */
  private openUserCard(member: LobbyMember, anchor: HTMLElement): void {
    const reopen = this.userCard?.dataset.key !== member.key;
    this.closeUserCard();
    if (!reopen || !this.container) return; // a second click on the same member closes it

    const card = el('div', 'lobby-user-card');
    card.dataset.key = member.key;
    card.appendChild(createAvatar(member.name, 'lg', undefined, member.avatarUrl));
    card.appendChild(el('div', 'lobby-user-card-name', member.name));
    const status =
      member.status === 'online' ? 'В сети' : member.status === 'away' ? 'Отошёл' : 'Не в сети';
    card.appendChild(
      el('div', `lobby-user-card-status lobby-user-card-${member.status}`, member.detail || status)
    );
    if (member.about) {
      card.appendChild(el('div', 'lobby-user-card-label', 'О себе'));
      card.appendChild(el('div', 'lobby-user-card-about', member.about));
    }
    if (member.isSelf) {
      const edit = el('button', 'lobby-user-card-edit', 'Редактировать профиль');
      edit.type = 'button';
      edit.onclick = () => {
        this.closeUserCard();
        this.profileCallback?.();
      };
      card.appendChild(edit);
    }

    this.container.appendChild(card);
    this.userCard = card;

    // To the right of the member list, level with the entry, kept inside the window.
    const rect = anchor.getBoundingClientRect();
    const top = Math.max(12, Math.min(rect.top - 12, window.innerHeight - card.offsetHeight - 12));
    card.style.top = `${top}px`;
    card.style.left = `${Math.min(rect.right + 12, window.innerWidth - card.offsetWidth - 12)}px`;
  }

  private closeUserCard(): void {
    this.userCard?.remove();
    this.userCard = null;
  }

  private updateMeSection(): void {
    if (!this.meSection) return;
    this.meSection.innerHTML = '';

    const self = this.members.find(m => m.isSelf);
    const name = this.currentUserName ?? self?.name;
    this.meSection.hidden = !name;
    if (!name) return;

    const away = self?.status === 'away';
    this.meSection.appendChild(createAvatar(name, 'sm', away ? 'away' : 'online', self?.avatarUrl));
    const text = el('div', 'lobby-me-text');
    text.appendChild(el('div', 'lobby-me-name', name));
    text.appendChild(el('div', 'lobby-me-status', away ? 'Отошёл' : 'В сети'));
    this.meSection.appendChild(text);
    const gear = el('span', 'lobby-me-settings');
    gear.innerHTML = ICONS.settings;
    this.meSection.appendChild(gear);
  }

  // ==================== messages ====================

  private buildMessage(message: LobbyMessage): HTMLDivElement {
    const messageElement = el('div', 'lobby-message');
    if (message.own) messageElement.classList.add('lobby-message-own');
    messageElement.dataset.userId = String(message.userId);
    messageElement.dataset.avatar = message.avatarUrl ?? '';

    messageElement.appendChild(createAvatar(message.name, 'md', undefined, message.avatarUrl));

    const body = el('div', 'lobby-message-body');
    const meta = el('div', 'lobby-message-meta');
    meta.appendChild(el('span', 'lobby-message-user', message.name));
    meta.appendChild(el('span', 'lobby-message-time', formatMessageTime(message.sentAtMs)));
    body.appendChild(meta);
    body.appendChild(el('div', 'lobby-message-text', message.text));
    messageElement.appendChild(body);

    messageElement.hidden = !this.matchesMessageFilter(messageElement);
    return messageElement;
  }

  /**
   * Re-resolve the avatars of the rendered messages. A message is often rendered before
   * its author's profile is known (history arrives with — or before — the member list),
   * and an author may change their picture later; only the avatars that differ are
   * replaced.
   */
  refreshMessageAvatars(resolve: (userId: number) => string | null): void {
    if (!this.chatMessages) return;
    for (const node of Array.from(this.chatMessages.children)) {
      const message = node as HTMLElement;
      const userId = Number(message.dataset.userId);
      if (!userId) continue;
      const url = resolve(userId) ?? '';
      if (url === message.dataset.avatar) continue;
      message.dataset.avatar = url;
      const name = message.querySelector('.lobby-message-user')?.textContent ?? '';
      message.firstElementChild?.replaceWith(createAvatar(name, 'md', undefined, url || null));
    }
  }

  private buildMessages(messages: readonly LobbyMessage[]): DocumentFragment {
    // One fragment → one layout, however many messages a page carries.
    const fragment = document.createDocumentFragment();
    for (const message of messages) fragment.appendChild(this.buildMessage(message));
    return fragment;
  }

  /**
   * Replace the displayed messages (entering a room, or its log was reset) and jump to
   * the newest. `hasMore`: older history exists and can be scrolled into.
   */
  setMessages(messages: readonly LobbyMessage[], hasMore: boolean): void {
    if (!this.chatMessages || !this.historyStatus) return;
    this.chatMessages.replaceChildren(this.historyStatus, this.buildMessages(messages));
    this.setHistoryState(hasMore, false);
    this.scrollToBottom();
    this.maybeLoadOlder();
  }

  /**
   * Add messages at the end (a live message, or a catch-up after rejoining). The view
   * follows them only if the user was at the bottom or wrote one of them — reading
   * older messages is never interrupted; a "new messages" button appears instead.
   */
  appendMessages(messages: readonly LobbyMessage[]): void {
    if (!this.chatMessages || messages.length === 0) return;
    const follow = this.isNearBottom() || messages.some(m => m.own);
    this.chatMessages.appendChild(this.buildMessages(messages));
    // The first message of an empty room brings the history row with it.
    this.setHistoryState(this.hasMoreHistory, this.loadingHistory);
    if (follow) this.scrollToBottom();
    else if (this.newMessagesButton) this.newMessagesButton.hidden = false;
  }

  /**
   * Add an older page above the current messages, keeping what the user is looking at
   * exactly where it is.
   */
  prependMessages(messages: readonly LobbyMessage[], hasMore: boolean): void {
    if (!this.chatMessages || !this.historyStatus) return;
    const list = this.chatMessages;
    const heightBefore = list.scrollHeight;
    const topBefore = list.scrollTop;

    this.historyStatus.after(this.buildMessages(messages));
    this.setHistoryState(hasMore, false);

    // Everything below the insertion point moved down by the inserted height.
    list.scrollTop = topBefore + (list.scrollHeight - heightBefore);
    if (messages.length > 0) this.maybeLoadOlder();
  }

  /** Whether older history exists / a page of it is being loaded right now. */
  setHistoryState(hasMore: boolean, loading: boolean): void {
    this.hasMoreHistory = hasMore;
    this.loadingHistory = loading;
    if (!this.historyStatus || !this.chatMessages) return;
    // The row is there whenever there are messages — "loading" for as long as older
    // history exists, not only while a request is in flight. Toggling it per request
    // would shift the whole list by its height each time a page is fetched.
    this.historyStatus.hidden = this.chatMessages.children.length <= 1;
    this.historyStatus.textContent = hasMore ? 'Загрузка истории…' : 'Начало истории';
  }

  /** Called when the user scrolls near the top and older history should be fetched. */
  setOnLoadOlderCallback(callback: () => void): void {
    this.loadOlderCallback = callback;
  }

  private readonly onMessagesScroll = (): void => {
    if (this.isNearBottom() && this.newMessagesButton) this.newMessagesButton.hidden = true;
    this.maybeLoadOlder();
  };

  private maybeLoadOlder(): void {
    if (!this.chatMessages || !this.hasMoreHistory || this.loadingHistory) return;
    // While a search filter hides rows the list is short by construction; loading on
    // "near the top" would then pull the whole history page after page.
    if (this.messageFilter) return;
    if (this.chatMessages.scrollTop <= LobbyUI.LOAD_OLDER_PX) this.loadOlderCallback?.();
  }

  private isNearBottom(): boolean {
    const list = this.chatMessages;
    if (!list) return true;
    return list.scrollHeight - list.scrollTop - list.clientHeight <= LobbyUI.STICK_TO_BOTTOM_PX;
  }

  private scrollToBottom(): void {
    if (this.chatMessages) this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    if (this.newMessagesButton) this.newMessagesButton.hidden = true;
  }

  /**
   * Add a system notice (e.g. a refused room join) to the chat.
   */
  addSystemMessage(text: string): void {
    if (!this.chatMessages) return;
    const messageElement = el('div', 'lobby-message lobby-message-system', text);
    messageElement.hidden = !this.matchesMessageFilter(messageElement);
    this.chatMessages.appendChild(messageElement);
    this.scrollToBottom();
  }

  private matchesMessageFilter(messageElement: Element): boolean {
    return (
      !this.messageFilter ||
      (messageElement.textContent ?? '').toLowerCase().includes(this.messageFilter)
    );
  }

  private applyMessageFilter(): void {
    if (!this.chatMessages) return;
    for (const child of Array.from(this.chatMessages.children)) {
      if (child === this.historyStatus) continue;
      (child as HTMLElement).hidden = !this.matchesMessageFilter(child);
    }
    this.scrollToBottom();
  }

  /**
   * Set callback for when message is sent
   */
  setOnMessageCallback(callback: (message: string) => void): void {
    this.messageCallback = callback;
  }

  /**
   * Send message
   */
  private sendMessage(): void {
    const message = this.chatInput?.value.trim();
    if (!message) return;

    if (this.messageCallback) {
      this.messageCallback(message);
    }

    // Clear input
    if (this.chatInput) {
      this.chatInput.value = '';
      this.chatInput.focus();
    }
  }

  /**
   * Clear all messages
   */
  clearMessages(): void {
    this.setMessages([], false);
  }

  /**
   * Focus on input field
   */
  focusInput(): void {
    this.chatInput?.focus();
  }

  /**
   * Destroy UI (cleanup)
   */
  destroy(): void {
    document.removeEventListener('keydown', this.onGlobalKeyDown);
    document.removeEventListener('pointerdown', this.onGlobalPointerDown);
    this.closeUserCard();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.chatMessages?.removeEventListener('scroll', this.onMessagesScroll);
    this.chatMessages = null;
    this.historyStatus = null;
    this.newMessagesButton = null;
    this.chatInput = null;
    this.usersList = null;
    this.usersCount = null;
    this.roomsList = null;
    this.headerTitle = null;
    this.headerOnline = null;
    this.meSection = null;
    this.userSearchInput = null;
    this.container = null;
    this.members = [];
    this.rooms.clear();
  }
}
