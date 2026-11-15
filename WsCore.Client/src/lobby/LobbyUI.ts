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
};

const ROOM_ICONS: Record<string, string> = {
  lobby: ICONS.lobby,
  voice: ICONS.voice,
  game: ICONS.game,
};

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Initials avatar; the tint is derived from the name so a user looks the same everywhere. */
function createAvatar(name: string, size: 'sm' | 'md', online = false): HTMLDivElement {
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
    `lobby-avatar lobby-avatar-${size}${online ? ' lobby-avatar-online' : ''}`,
    initials.toUpperCase()
  );
  avatar.style.background = `hsl(${hue} 22% 26%)`;
  avatar.style.color = `hsl(${hue} 45% 82%)`;
  return avatar;
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
 * Lobby UI: sidebar (brand, rooms, online users, current user) + room chat.
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
  private users: Map<number, string> = new Map();
  private rooms: Map<string, LobbyRoom> = new Map();
  private currentUserId: number = -1;
  private currentUserName: string | null = null;
  private currentRoomId: string | null = null;
  /** Room whose join is awaiting the server's answer (shown as "Joining…"). */
  private pendingRoomId: string | null = null;
  private maxMessages: number = 100;
  private userFilter = '';
  private messageFilter = '';
  private static cssLoaded = false;

  private readonly onGlobalKeyDown = (e: KeyboardEvent): void => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      this.userSearchInput?.focus();
    }
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

    this.meSection = el('div', 'lobby-me');
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

    this.chatMessages = el('div', 'lobby-messages');
    chatArea.appendChild(this.chatMessages);

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
   * Add or update user in the list
   */
  addUser(userId: number, userName: string): void {
    this.users.set(userId, userName);
    this.updateUsersList();
  }

  /**
   * Remove user from the list
   */
  removeUser(userId: number): void {
    this.users.delete(userId);
    this.updateUsersList();
  }

  /**
   * Clear all users from the list
   */
  clearAllUsers(): void {
    this.users.clear();
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
  }

  /**
   * Update the users list display (+ the counters and the current-user footer)
   */
  private updateUsersList(): void {
    if (!this.usersList) return;

    this.usersList.innerHTML = '';

    // Sort users by ID for consistent display
    const sortedUsers = Array.from(this.users.entries())
      .map(([id, name]): [number, string] => [id, this.displayName(id, name)])
      .sort((a, b) => a[0] - b[0]);
    const visibleUsers = sortedUsers.filter(([, name]) =>
      name.toLowerCase().includes(this.userFilter)
    );

    for (const [userId, userName] of visibleUsers) {
      const userElement = el('div', 'lobby-user-item');
      if (userId === this.currentUserId) {
        userElement.classList.add('lobby-current-user');
      }
      userElement.appendChild(createAvatar(userName, 'sm', true));
      userElement.appendChild(el('span', 'lobby-user-name', userName));
      this.usersList.appendChild(userElement);
    }

    if (visibleUsers.length === 0 && this.userFilter) {
      this.usersList.appendChild(el('div', 'lobby-users-empty', 'Никого не найдено'));
    }

    if (this.usersCount) this.usersCount.textContent = String(this.users.size);
    if (this.headerOnline) this.headerOnline.textContent = `${this.users.size} online`;

    this.updateMeSection();
  }

  /** The local user's own name is known up front; room rosters may only carry a placeholder. */
  private displayName(userId: number, userName: string): string {
    return userId === this.currentUserId && this.currentUserName ? this.currentUserName : userName;
  }

  private updateMeSection(): void {
    if (!this.meSection) return;
    this.meSection.innerHTML = '';

    const name = this.currentUserName ?? this.users.get(this.currentUserId);
    this.meSection.hidden = !name;
    if (!name) return;

    this.meSection.appendChild(createAvatar(name, 'sm', true));
    const text = el('div', 'lobby-me-text');
    text.appendChild(el('div', 'lobby-me-name', name));
    text.appendChild(el('div', 'lobby-me-status', 'В сети'));
    this.meSection.appendChild(text);
  }

  /**
   * Add message to chat
   */
  addMessage(userName: string, message: string, isOwnMessage: boolean = false): void {
    if (!this.chatMessages) return;

    const messageElement = el('div', 'lobby-message');
    if (isOwnMessage) {
      messageElement.classList.add('lobby-message-own');
    }

    messageElement.appendChild(createAvatar(userName, 'md'));

    const body = el('div', 'lobby-message-body');
    const meta = el('div', 'lobby-message-meta');
    meta.appendChild(el('span', 'lobby-message-user', userName));
    meta.appendChild(
      el(
        'span',
        'lobby-message-time',
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      )
    );
    body.appendChild(meta);
    body.appendChild(el('div', 'lobby-message-text', message));
    messageElement.appendChild(body);

    messageElement.hidden = !this.matchesMessageFilter(messageElement);
    this.chatMessages.appendChild(messageElement);

    // Auto-scroll to bottom
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;

    // Remove old messages if exceeding max
    const children = this.chatMessages.children;
    while (children.length > this.maxMessages) {
      this.chatMessages.removeChild(children[0]);
    }
  }

  /**
   * Add a system notice (e.g. a refused room join) to the chat.
   */
  addSystemMessage(text: string): void {
    if (!this.chatMessages) return;
    const messageElement = el('div', 'lobby-message lobby-message-system', text);
    messageElement.hidden = !this.matchesMessageFilter(messageElement);
    this.chatMessages.appendChild(messageElement);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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
      (child as HTMLElement).hidden = !this.matchesMessageFilter(child);
    }
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
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
    if (this.chatMessages) {
      this.chatMessages.innerHTML = '';
    }
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
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.chatMessages = null;
    this.chatInput = null;
    this.usersList = null;
    this.usersCount = null;
    this.roomsList = null;
    this.headerTitle = null;
    this.headerOnline = null;
    this.meSection = null;
    this.userSearchInput = null;
    this.container = null;
    this.users.clear();
    this.rooms.clear();
  }
}
