import styles from './LobbyUI.css?inline';
import { linkify } from '../utils/Linkify';

const svg = (body: string, size = 20): string =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** Static inline icons (trusted markup — never interpolate user data into these). */
const ICONS = {
  // The moai of public/favicon.svg (one even-odd path, so it takes the text colour).
  logo:
    '<svg width="28" height="28" viewBox="0 0 64 64" fill="currentColor" fill-rule="evenodd" aria-hidden="true">' +
    '<path d="M24 3H40Q44 3 44.5 7L46 17H48V22H47V24Q51 24 51 28V39Q51 42 47 42V45Q47 52 41 54V57H50Q54 57 54 61H10Q10 57 14 57H23V54Q17 52 17 45V42Q13 42 13 39V28Q13 24 17 24V22H16V17H18L19.5 7Q20 3 24 3Z' +
    'M19 22H29L27.5 36L25 36L26 28Q22 29.5 19 27.5ZM45 22H35L36.5 36L39 36L38 28Q42 29.5 45 27.5Z' +
    'M25 38H39V40H25ZM25.5 45H38.5V47.2H25.5Z"/></svg>',
  reload: svg('<path d="M20 11a8 8 0 1 0-2.3 6.3"/><path d="M20 4v7h-7"/>', 15),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.600-3.600"/>', 18),
  lobby: svg('<path d="M9 4 7 20M17 4l-2 16M4 9h17M3 15h17"/>'),
  voice: svg('<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>'),
  lock: svg(
    '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'
  ),
  plus: svg('<path d="M12 5v14M5 12h14"/>', 16),
  game: svg(
    '<path d="M7 7h10a5 5 0 0 1 4.900 4l.900 4.500a2.500 2.500 0 0 1-4.400 2L16.500 15h-9l-1.900 2.500a2.500 2.500 0 0 1-4.400-2L2.100 11A5 5 0 0 1 7 7z"/>' +
      '<path d="M7.500 10v3M6 11.500h3M15.500 10.500h.010M17.500 12.500h.010"/>'
  ),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  mic: svg(
    '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    18
  ),
  micOff: svg(
    '<path d="M15 10V6a3 3 0 0 0-5.700-1.300M9 9v2a3 3 0 0 0 4.900 2.300M5 11a7 7 0 0 0 11.500 5.400M19 11a7 7 0 0 1-.400 2.300M12 18v3M3 3l18 18"/>',
    18
  ),
  headphones: svg(
    '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/>',
    18
  ),
  headphonesOff: svg(
    '<path d="M4 15v-3a8 8 0 0 1 12.600-6.500M20 12v3"/><rect x="3" y="14" width="5" height="7" rx="2"/><rect x="16" y="14" width="5" height="7" rx="2"/><path d="M3 3l18 18"/>',
    18
  ),
  hangUp: svg(
    '<path d="M3 15.500c5-4.700 13-4.700 18 0l-2.300 2.300-3.200-1.500v-2.600a12 12 0 0 0-7 0v2.600l-3.200 1.500z"/>',
    18
  ),
  send: svg('<path d="M21 3 10.500 13.500M21 3l-6.500 18-4-7.500L3 9.500 21 3z"/>'),
  trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>', 16),
  shield: svg('<path d="M12 3 5 6v5c0 4.500 3 8.300 7 10 4-1.700 7-5.500 7-10V6l-7-3z"/>', 18),
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
  size: 'xs' | 'sm' | 'md' | 'lg',
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

function metaKey(a: { login?: string | null; role?: string | null; canDelete?: boolean }): string {
  return `${a.login ?? ''}|${a.role ?? ''}|${a.canDelete ? 1 : 0}`;
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
  /** The author's public login (claimed accounts), shown as @login. */
  login?: string | null;
  /** The author's role in this channel ("админ", a custom title…). */
  role?: string | null;
  /** Whether we may delete it (our own message, or a moderator). */
  canDelete?: boolean;
}

/** What a message shows about its author — re-resolved when presence / roles change. */
export interface MessageAuthor {
  avatarUrl: string | null;
  login: string | null;
  role: string | null;
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
  /** The user id (0 / undefined for an anonymous connection). */
  userId?: number;
  /** Public login of a claimed account. */
  login?: string | null;
  /** Role in the current channel ("админ", a custom title, "админ сервера"). */
  role?: string | null;
  /** We may manage this user in the current channel (roles / restrictions). */
  manageable?: boolean;
  /** Their active restriction in the current channel, worded ("без права писать"). */
  restriction?: string | null;
}

/** A room as the lobby displays it (the list itself comes from the server). */
export interface LobbyRoom {
  id: string;
  name: string;
  userCount: number;
  /** A spatial (3D game) room: shows a Play button, and clicking it enters the game. */
  playable: boolean;
  /** A private channel (seen only by admins and the members given access): a lock icon. */
  isPrivate?: boolean;
  /** A voice channel: clicking it also joins its voice; who talks there is listed under it. */
  isVoice?: boolean;
  /** Who is in its voice right now. */
  voice?: LobbyVoiceParticipant[];
}

/** Someone in a voice channel, as listed under it. */
export interface LobbyVoiceParticipant {
  clientId: number;
  name: string;
  avatarUrl?: string | null;
  isSelf: boolean;
  muted: boolean;
  deafened: boolean;
}

/** Our own voice: the panel above the profile. */
export interface LobbyVoiceView {
  status: 'off' | 'connecting' | 'connected';
  /** The voice channel (connecting / connected). */
  roomName: string | null;
  muted: boolean;
  deafened: boolean;
  /** Why voice stopped / could not start, worded; shown while off. */
  error: string | null;
}

export type VoiceControl = 'mute' | 'deafen' | 'leave' | 'dismiss';

/**
 * Lobby UI: sidebar (brand, rooms, member list, current user) + room chat.
 *
 * Purely presentational: it renders the messages and members it is given. The chat
 * list is windowed by the caller's log (history pages are prepended as the user scrolls
 * up) and never re-renders on a single new message.
 */
export default class LobbyUI {
  private container: HTMLDivElement | null = null;
  private sidebar: HTMLDivElement | null = null;
  private header: HTMLDivElement | null = null;
  /** Phone layout: the sidebar is a drawer over the chat (see LobbyUI.css). */
  private readonly narrowQuery: MediaQueryList | null =
    typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 760px)') : null;
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
  private deleteCallback: ((messageId: number) => void) | null = null;
  private manageChannelCallback: (() => void) | null = null;
  private manageMemberCallback: ((userId: number) => void) | null = null;
  private manageButton: HTMLButtonElement | null = null;
  private createChannelButton: HTMLButtonElement | null = null;
  private createChannelCallback: (() => void) | null = null;
  private updateButton: HTMLButtonElement | null = null;
  private voiceJoinCallback: ((roomId: string) => void) | null = null;
  private voiceControlCallback: ((control: VoiceControl) => void) | null = null;
  /** Our voice: the panel above the profile (+ compact header controls on phones). */
  private voicePanel: HTMLDivElement | null = null;
  private headerVoice: HTMLDivElement | null = null;
  private voice: LobbyVoiceView = {
    status: 'off',
    roomName: null,
    muted: false,
    deafened: false,
    error: null,
  };
  /** Voice channel we are in (or joining) — its row says so. */
  private voiceRoomId: string | null = null;
  private speaking: ReadonlySet<number> = new Set();
  private sendButton: HTMLButtonElement | null = null;
  /** "Open this link?" — a link in a message opens only once confirmed here. */
  private linkPopover: HTMLDivElement | null = null;
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
      if (this.linkPopover) this.closeLinkPopover();
      else if (this.userCard) this.closeUserCard();
      else this.closeNav();
    }
  };

  private readonly onNarrowChange = (): void => this.updateSidebarInert();

  // The on-screen keyboard shrinks the visual viewport, not the layout one (iOS): size
  // the lobby to what is actually visible so the composer stays above the keyboard.
  private readonly onViewportResize = (): void => {
    const viewport = window.visualViewport;
    if (!viewport || !this.container) return;
    this.container.style.setProperty('--lobby-height', `${Math.round(viewport.height)}px`);
    // iOS scrolls the page to reveal a focused input; the layout already made room.
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  };

  // A click anywhere else closes the open user card.
  private readonly onGlobalPointerDown = (e: PointerEvent): void => {
    const target = e.target as Node;
    if (this.userCard && !this.userCard.contains(target)) this.closeUserCard();
    if (
      this.linkPopover &&
      !this.linkPopover.contains(target) &&
      !(target instanceof Element && target.closest('.lobby-message-link'))
    )
      this.closeLinkPopover();
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

    this.sidebar = this.buildSidebar();
    this.container.appendChild(this.sidebar);
    // Phone layout: dims the chat behind the open drawer; a tap on it closes the drawer.
    const backdrop = el('div', 'lobby-nav-backdrop');
    backdrop.onclick = () => this.closeNav();
    this.container.appendChild(backdrop);
    this.container.appendChild(this.buildChatArea());

    document.body.appendChild(this.container);

    // Clear any default margins/padding
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';

    document.addEventListener('keydown', this.onGlobalKeyDown);
    document.addEventListener('pointerdown', this.onGlobalPointerDown);
    this.narrowQuery?.addEventListener('change', this.onNarrowChange);
    window.visualViewport?.addEventListener('resize', this.onViewportResize);
    this.onViewportResize();
    this.updateSidebarInert();

    this.updateRoomsList();
    this.updateUsersList();
  }

  private buildSidebar(): HTMLDivElement {
    const sidebar = el('div', 'lobby-left-sidebar');

    const brand = el('div', 'lobby-brand');
    brand.innerHTML = ICONS.logo;
    brand.appendChild(el('span', 'lobby-brand-name', 'TOX'));
    brand.appendChild(el('span', 'lobby-brand-version', `v${__APP_VERSION__}`));
    // Shown once a newer build is deployed (setUpdateAvailable): reloading picks it up.
    this.updateButton = el('button', 'lobby-update');
    this.updateButton.type = 'button';
    this.updateButton.innerHTML = ICONS.reload;
    this.updateButton.appendChild(el('span', undefined, 'Обновить'));
    this.updateButton.title = 'Вышла новая версия — перезагрузить страницу';
    this.updateButton.hidden = true;
    this.updateButton.addEventListener('click', () => location.reload());
    brand.appendChild(this.updateButton);
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
    const roomsTitle = el('div', 'lobby-rooms-title');
    roomsTitle.appendChild(el('span', undefined, 'Каналы'));
    this.createChannelButton = el('button', 'lobby-rooms-add');
    this.createChannelButton.type = 'button';
    this.createChannelButton.title = 'Создать канал';
    this.createChannelButton.setAttribute('aria-label', 'Создать канал');
    this.createChannelButton.innerHTML = ICONS.plus;
    this.createChannelButton.hidden = true;
    this.createChannelButton.onclick = () => {
      this.closeNav();
      this.createChannelCallback?.();
    };
    roomsTitle.appendChild(this.createChannelButton);
    roomsSection.appendChild(roomsTitle);
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

    this.voicePanel = el('div', 'lobby-voice-panel');
    this.voicePanel.hidden = true;
    sidebar.appendChild(this.voicePanel);

    // Our own entry; a click opens the profile (name, avatar, about, account).
    this.meSection = el('div', 'lobby-me');
    this.meSection.setAttribute('role', 'button');
    this.meSection.tabIndex = 0;
    this.meSection.title = 'Профиль';
    const openProfile = () => {
      this.closeNav();
      this.profileCallback?.();
    };
    this.meSection.onclick = openProfile;
    this.meSection.onkeydown = e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openProfile();
      }
    };
    sidebar.appendChild(this.meSection);

    return sidebar;
  }

  private buildChatArea(): HTMLDivElement {
    const chatArea = el('div', 'lobby-chat-area');

    const header = el('div', 'lobby-chat-header');
    this.header = header;
    // Phone layout only (CSS): opens the sidebar drawer — rooms, members, profile.
    const navToggle = this.buildIconButton('lobby-nav-toggle', 'Комнаты и участники', ICONS.menu);
    navToggle.setAttribute('aria-expanded', 'false');
    navToggle.onclick = () => this.openNav();
    header.appendChild(navToggle);
    const heading = el('div', 'lobby-chat-heading');
    this.headerTitle = el('span', 'lobby-chat-header-title', 'Connecting…');
    this.headerOnline = el('div', 'lobby-chat-header-online', '0 online');
    heading.appendChild(this.headerTitle);
    heading.appendChild(this.headerOnline);
    header.appendChild(heading);
    const headerTools = el('div', 'lobby-chat-header-tools');
    const roomSearch = this.buildSearch('Поиск в комнате…', 'lobby-room-search', value => {
      this.messageFilter = value;
      this.applyMessageFilter();
    });
    headerTools.appendChild(roomSearch);
    // Phone layout only (CSS): the room search folds into this button.
    const searchToggle = this.buildIconButton(
      'lobby-search-toggle',
      'Поиск в комнате',
      ICONS.search
    );
    searchToggle.onclick = () => {
      const open = !header.classList.contains('lobby-search-open');
      header.classList.toggle('lobby-search-open', open);
      searchToggle.setAttribute('aria-expanded', String(open));
      const input = roomSearch.querySelector('input');
      if (open) input?.focus();
      else if (input && input.value) {
        // Closing the field drops its filter too — nothing should stay filtered unseen.
        input.value = '';
        this.messageFilter = '';
        this.applyMessageFilter();
      }
    };
    searchToggle.setAttribute('aria-expanded', 'false');
    headerTools.appendChild(searchToggle);
    // Channel management (roles, permissions): shown to the channel's admins only.
    this.manageButton = el('button', 'lobby-channel-manage');
    this.manageButton.type = 'button';
    this.manageButton.title = 'Управление каналом';
    this.manageButton.setAttribute('aria-label', 'Управление каналом');
    this.manageButton.innerHTML = ICONS.shield;
    this.manageButton.hidden = true;
    this.manageButton.onclick = () => this.manageChannelCallback?.();
    headerTools.appendChild(this.manageButton);
    // Phone layout only (CSS): mute / leave voice without opening the drawer.
    this.headerVoice = el('div', 'lobby-header-voice');
    this.headerVoice.hidden = true;
    headerTools.appendChild(this.headerVoice);
    header.appendChild(headerTools);
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
    this.sendButton = sendBtn;

    chatArea.appendChild(inputContainer);
    return chatArea;
  }

  private buildIconButton(className: string, label: string, icon: string): HTMLButtonElement {
    const button = el('button', `lobby-icon-btn ${className}`);
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    button.innerHTML = icon;
    return button;
  }

  private isNarrow(): boolean {
    return this.narrowQuery?.matches ?? false;
  }

  /** Phone layout: slide the sidebar in over the chat. */
  private openNav(): void {
    if (!this.container) return;
    this.container.classList.add('lobby-nav-open');
    this.header?.querySelector('.lobby-nav-toggle')?.setAttribute('aria-expanded', 'true');
    this.updateSidebarInert();
    this.roomsList?.querySelector<HTMLElement>('.lobby-room-item')?.focus({ preventScroll: true });
  }

  private closeNav(): void {
    if (!this.container?.classList.contains('lobby-nav-open')) return;
    this.container.classList.remove('lobby-nav-open');
    this.header?.querySelector('.lobby-nav-toggle')?.setAttribute('aria-expanded', 'false');
    this.updateSidebarInert();
  }

  // A closed drawer is off-screen: keep it out of the tab order and screen readers.
  private updateSidebarInert(): void {
    if (!this.sidebar || !this.container) return;
    this.sidebar.inert = this.isNarrow() && !this.container.classList.contains('lobby-nav-open');
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

  /** Set callback for deleting a message (its delete button). */
  setOnDeleteMessageCallback(callback: (messageId: number) => void): void {
    this.deleteCallback = callback;
  }

  /** Set callback for the channel management button. */
  setOnManageChannelCallback(callback: () => void): void {
    this.manageChannelCallback = callback;
  }

  /** Set callback for "manage" in a member's card (their roles in this channel). */
  setOnManageMemberCallback(callback: (userId: number) => void): void {
    this.manageMemberCallback = callback;
  }

  /** Set callback for the "+" next to the channel list (create a channel). */
  setOnCreateChannelCallback(callback: () => void): void {
    this.createChannelCallback = callback;
  }

  /** Show the "+" next to the channel list (server admins create channels). */
  setCanCreateChannel(canCreate: boolean): void {
    if (this.createChannelButton) this.createChannelButton.hidden = !canCreate;
  }

  /** Show the "Обновить" button next to the version: a newer build is deployed. */
  setUpdateAvailable(available: boolean): void {
    if (this.updateButton) this.updateButton.hidden = !available;
  }

  /** Show the channel management button (we hold an admin right in this channel). */
  setCanManageChannel(canManage: boolean): void {
    if (this.manageButton) this.manageButton.hidden = !canManage;
  }

  /**
   * Disable the composer with a reason (muted / banned in this channel), or enable it
   * again with null.
   */
  setComposerBlocked(reason: string | null): void {
    if (!this.chatInput) return;
    const blocked = reason !== null;
    if (this.chatInput.disabled === blocked && (!blocked || this.chatInput.placeholder === reason))
      return;
    this.chatInput.disabled = blocked;
    this.chatInput.placeholder = reason ?? 'Написать сообщение…';
    if (this.sendButton) this.sendButton.disabled = blocked;
    this.chatInput.parentElement?.classList.toggle('lobby-input-blocked', blocked);
  }

  /** Set callback for a click on our own entry (open the profile). */
  setOnProfileCallback(callback: () => void): void {
    this.profileCallback = callback;
  }

  /** Clicking a voice channel we are not talking in. */
  setOnVoiceJoinCallback(callback: (roomId: string) => void): void {
    this.voiceJoinCallback = callback;
  }

  /** The voice panel's buttons. */
  setOnVoiceControlCallback(callback: (control: VoiceControl) => void): void {
    this.voiceControlCallback = callback;
  }

  /** Our voice state (the panel); `roomId` = the voice channel we are in / joining. */
  setVoice(view: LobbyVoiceView, roomId: string | null): void {
    const roomChanged = roomId !== this.voiceRoomId;
    this.voice = view;
    this.voiceRoomId = roomId;
    this.updateVoicePanel();
    if (roomChanged) this.updateRoomsList();
  }

  /** Who is speaking (client ids): only the rings under the voice channels change. */
  setVoiceSpeaking(speaking: ReadonlySet<number>): void {
    this.speaking = new Set(speaking);
    this.roomsList?.querySelectorAll<HTMLElement>('.lobby-voice-member').forEach(item => {
      item.classList.toggle(
        'lobby-voice-speaking',
        this.speaking.has(Number(item.dataset.clientId))
      );
    });
    this.voicePanel?.classList.toggle(
      'lobby-voice-panel-speaking',
      [...this.speaking].some(id => this.isSelfVoice(id))
    );
  }

  private isSelfVoice(clientId: number): boolean {
    return (
      this.rooms
        .get(this.voiceRoomId ?? '')
        ?.voice?.some(p => p.clientId === clientId && p.isSelf) ?? false
    );
  }

  private updateVoicePanel(): void {
    const panel = this.voicePanel;
    if (!panel) return;
    const v = this.voice;
    panel.innerHTML = '';
    panel.hidden = v.status === 'off' && !v.error;
    panel.classList.toggle('lobby-voice-panel-connected', v.status === 'connected');
    if (this.headerVoice) {
      this.headerVoice.innerHTML = '';
      this.headerVoice.hidden = v.status === 'off';
    }
    if (panel.hidden) return;

    if (v.status === 'off') {
      // Only an error to tell.
      const text = el('div', 'lobby-voice-panel-text');
      text.appendChild(
        el('div', 'lobby-voice-panel-title lobby-voice-panel-error', 'Голос отключён')
      );
      text.appendChild(el('div', 'lobby-voice-panel-detail', v.error ?? ''));
      panel.appendChild(text);
      const dismiss = this.voiceButton('Скрыть', '×', 'dismiss');
      dismiss.classList.add('lobby-voice-dismiss');
      panel.appendChild(dismiss);
      return;
    }

    const text = el('div', 'lobby-voice-panel-text');
    text.appendChild(
      el(
        'div',
        'lobby-voice-panel-title',
        v.status === 'connected' ? 'Голос подключён' : 'Подключение…'
      )
    );
    text.appendChild(el('div', 'lobby-voice-panel-detail', v.roomName ?? ''));
    panel.appendChild(text);

    const controls = el('div', 'lobby-voice-controls');
    controls.append(...this.voiceControls());
    panel.appendChild(controls);
    if (this.headerVoice) {
      const compact = this.voiceControls();
      this.headerVoice.append(compact[0], compact[2]); // mute + leave
    }
  }

  private voiceControls(): HTMLButtonElement[] {
    const v = this.voice;
    const mute = this.voiceButton(
      v.muted ? 'Включить микрофон' : 'Выключить микрофон',
      v.muted ? ICONS.micOff : ICONS.mic,
      'mute'
    );
    mute.classList.toggle('lobby-voice-btn-off', v.muted);
    mute.setAttribute('aria-pressed', String(v.muted));
    const deafen = this.voiceButton(
      v.deafened ? 'Включить звук' : 'Выключить звук',
      v.deafened ? ICONS.headphonesOff : ICONS.headphones,
      'deafen'
    );
    deafen.classList.toggle('lobby-voice-btn-off', v.deafened);
    deafen.setAttribute('aria-pressed', String(v.deafened));
    const leave = this.voiceButton('Отключиться', ICONS.hangUp, 'leave');
    leave.classList.add('lobby-voice-leave');
    return [mute, deafen, leave];
  }

  private voiceButton(label: string, icon: string, control: VoiceControl): HTMLButtonElement {
    const button = el('button', 'lobby-voice-btn');
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    if (icon.startsWith('<svg')) button.innerHTML = icon;
    else button.textContent = icon;
    button.onclick = () => this.voiceControlCallback?.(control);
    return button;
  }

  private buildVoiceMembers(room: LobbyRoom): HTMLDivElement {
    const list = el('div', 'lobby-voice-members');
    for (const p of room.voice ?? []) {
      const item = el('div', 'lobby-voice-member');
      item.dataset.clientId = String(p.clientId);
      if (this.speaking.has(p.clientId)) item.classList.add('lobby-voice-speaking');
      if (p.isSelf) item.classList.add('lobby-voice-self');
      item.appendChild(createAvatar(p.name, 'xs', undefined, p.avatarUrl));
      item.appendChild(el('span', 'lobby-voice-member-name', p.name));
      if (p.deafened || p.muted) {
        const state = el('span', 'lobby-voice-member-state');
        state.innerHTML = p.deafened ? ICONS.headphonesOff : ICONS.micOff;
        state.title = p.deafened ? 'Звук выключен' : 'Микрофон выключен';
        item.appendChild(state);
      }
      list.appendChild(item);
    }
    return list;
  }

  /**
   * Update room list display
   */
  private updateRoomsList(): void {
    if (!this.roomsList) return;

    this.roomsList.innerHTML = '';

    for (const [roomId, room] of this.rooms) {
      const roomElement = el('div', 'lobby-room-item');
      roomElement.tabIndex = 0;
      if (roomId === this.currentRoomId) {
        roomElement.classList.add('lobby-room-current');
      }
      if (roomId === this.pendingRoomId) {
        roomElement.classList.add('lobby-room-pending');
      }

      const icon = el('span', 'lobby-room-icon');
      icon.innerHTML = room.isPrivate
        ? ICONS.lock
        : room.isVoice
          ? ICONS.voice
          : (ROOM_ICONS[roomId] ?? (room.playable ? ICONS.game : ICONS.lobby));
      if (room.isPrivate) icon.title = room.isVoice ? 'Закрытый голосовой канал' : 'Закрытый канал';
      else if (room.isVoice) icon.title = 'Голосовой канал';
      if (room.isVoice) roomElement.classList.add('lobby-room-voice');
      if (roomId === this.voiceRoomId) roomElement.classList.add('lobby-room-in-voice');
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
          this.closeNav();
          this.playCallback?.(roomId);
        };
        roomElement.appendChild(playButton);
      }

      // A game room is entered through the game (joining it gives you an avatar);
      // any other room is joined as a chat room — a voice channel also joins its voice.
      roomElement.onclick = () => {
        this.closeNav();
        if (room.playable) {
          this.playCallback?.(roomId);
          return;
        }
        if (this.roomJoinCallback && roomId !== this.currentRoomId) this.roomJoinCallback(roomId);
        if (room.isVoice && roomId !== this.voiceRoomId) this.voiceJoinCallback?.(roomId);
      };
      roomElement.onkeydown = e => {
        if (e.target === roomElement && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          roomElement.click();
        }
      };

      this.roomsList.appendChild(roomElement);
      if (room.isVoice && room.voice && room.voice.length > 0)
        this.roomsList.appendChild(this.buildVoiceMembers(room));
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
    const nameRow = el('span', 'lobby-user-name-row');
    nameRow.appendChild(el('span', 'lobby-user-name', member.name));
    if (member.role) nameRow.appendChild(el('span', 'lobby-role-badge', member.role));
    text.appendChild(nameRow);
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
    if (member.login) card.appendChild(el('div', 'lobby-user-card-login', `@${member.login}`));
    if (member.role) card.appendChild(el('span', 'lobby-role-badge', member.role));
    const status =
      member.status === 'online' ? 'В сети' : member.status === 'away' ? 'Отошёл' : 'Не в сети';
    card.appendChild(
      el('div', `lobby-user-card-status lobby-user-card-${member.status}`, member.detail || status)
    );
    if (member.about) {
      card.appendChild(el('div', 'lobby-user-card-label', 'О себе'));
      card.appendChild(el('div', 'lobby-user-card-about', member.about));
    }
    if (member.restriction) {
      card.appendChild(el('div', 'lobby-user-card-label', 'В этом канале'));
      card.appendChild(el('div', 'lobby-user-card-restriction', member.restriction));
    }
    if (member.manageable && member.userId) {
      const userId = member.userId;
      const manage = el('button', 'lobby-user-card-edit', 'Права в канале…');
      manage.type = 'button';
      manage.onclick = () => {
        this.closeUserCard();
        this.manageMemberCallback?.(userId);
      };
      card.appendChild(manage);
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

    // Phone layout: a bottom sheet, placed by CSS.
    if (this.isNarrow()) return;
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
    const status = away ? 'Отошёл' : 'В сети';
    text.appendChild(
      el('div', 'lobby-me-status', self?.login ? `${status} · @${self.login}` : status)
    );
    this.meSection.appendChild(text);
    const gear = el('span', 'lobby-me-settings');
    gear.innerHTML = ICONS.settings;
    this.meSection.appendChild(gear);
  }

  // ==================== messages ====================

  private buildMessage(message: LobbyMessage): HTMLDivElement {
    const messageElement = el('div', 'lobby-message');
    if (message.own) messageElement.classList.add('lobby-message-own');
    messageElement.dataset.id = String(message.id);
    messageElement.dataset.userId = String(message.userId);
    messageElement.dataset.name = message.name;
    messageElement.dataset.sentAt = String(message.sentAtMs);
    messageElement.dataset.avatar = message.avatarUrl ?? '';

    messageElement.appendChild(createAvatar(message.name, 'md', undefined, message.avatarUrl));

    const body = el('div', 'lobby-message-body');
    body.appendChild(this.buildMessageMeta(messageElement, message));
    body.appendChild(this.buildMessageText(message.text));
    messageElement.appendChild(body);

    messageElement.hidden = !this.matchesMessageFilter(messageElement);
    return messageElement;
  }

  /** The message text, links in it clickable (each opens only after a confirmation). */
  private buildMessageText(text: string): HTMLDivElement {
    const node = el('div', 'lobby-message-text');
    for (const part of linkify(text)) {
      if (!part.href) {
        node.appendChild(document.createTextNode(part.text));
        continue;
      }
      const link = el('a', 'lobby-message-link', part.text);
      const href = part.href;
      link.href = href;
      link.rel = 'noopener noreferrer nofollow';
      link.target = '_blank';
      link.onclick = e => {
        // Any click — middle / ctrl too — goes through the confirmation.
        e.preventDefault();
        this.openLinkPopover(href, link);
      };
      link.onauxclick = e => {
        if (e.button !== 1) return;
        e.preventDefault();
        this.openLinkPopover(href, link);
      };
      node.appendChild(link);
    }
    return node;
  }

  private openLinkPopover(href: string, anchor: HTMLElement): void {
    const same = this.linkPopover?.dataset.href === href;
    this.closeLinkPopover();
    if (same || !this.container) return; // a second click on the link closes it

    const url = new URL(href);
    const popover = el('div', 'lobby-link-popover');
    popover.dataset.href = href;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-label', 'Открыть ссылку');
    popover.appendChild(el('div', 'lobby-link-popover-title', 'Открыть ссылку?'));
    // The host as the browser will resolve it (punycode for look-alike domains).
    popover.appendChild(el('div', 'lobby-link-popover-host', url.host));
    popover.appendChild(el('div', 'lobby-link-popover-url', href));
    popover.appendChild(
      el(
        'div',
        'lobby-link-popover-hint',
        'Ссылка ведёт на внешний сайт. Открывайте, только если доверяете.'
      )
    );
    const buttons = el('div', 'lobby-dialog-buttons');
    const cancel = el('button', 'lobby-dialog-button lobby-dialog-button-quiet', 'Отмена');
    cancel.type = 'button';
    cancel.onclick = () => this.closeLinkPopover();
    const open = el('button', 'lobby-dialog-button lobby-dialog-button-primary', 'Открыть');
    open.type = 'button';
    open.onclick = () => {
      this.closeLinkPopover();
      window.open(href, '_blank', 'noopener,noreferrer');
    };
    buttons.append(cancel, open);
    popover.appendChild(buttons);

    this.container.appendChild(popover);
    this.linkPopover = popover;

    // Below the link (above it if there is no room), kept inside the window.
    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const below = rect.bottom + margin;
    const top =
      below + popover.offsetHeight <= window.innerHeight - margin
        ? below
        : Math.max(margin, rect.top - margin - popover.offsetHeight);
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - popover.offsetWidth - margin)
    );
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
    open.focus({ preventScroll: true });
  }

  private closeLinkPopover(): void {
    this.linkPopover?.remove();
    this.linkPopover = null;
  }

  // Name, @login, role, time and (if allowed) the delete button. Its inputs are kept on
  // the message element, so a refresh can tell whether it needs rebuilding.
  private buildMessageMeta(
    messageElement: HTMLElement,
    author: {
      name: string;
      sentAtMs: number;
      login?: string | null;
      role?: string | null;
      canDelete?: boolean;
    }
  ): HTMLDivElement {
    messageElement.dataset.meta = metaKey(author);
    const meta = el('div', 'lobby-message-meta');
    meta.appendChild(el('span', 'lobby-message-user', author.name));
    if (author.login) meta.appendChild(el('span', 'lobby-message-login', `@${author.login}`));
    if (author.role) meta.appendChild(el('span', 'lobby-role-badge', author.role));
    meta.appendChild(el('span', 'lobby-message-time', formatMessageTime(author.sentAtMs)));
    if (author.canDelete) {
      const remove = el('button', 'lobby-message-delete');
      remove.type = 'button';
      remove.title = 'Удалить сообщение';
      remove.setAttribute('aria-label', 'Удалить сообщение');
      remove.innerHTML = ICONS.trash;
      const id = Number(messageElement.dataset.id);
      remove.onclick = () => this.deleteCallback?.(id);
      meta.appendChild(remove);
    }
    return meta;
  }

  /**
   * Re-resolve what the rendered messages show about their authors (avatar, @login,
   * role) and whether we may delete them. A message is often rendered before its
   * author's profile is known (history arrives with — or before — the member list), and
   * profiles and roles change later; only the parts that differ are rebuilt.
   */
  refreshMessages(
    resolve: (userId: number) => MessageAuthor,
    canDelete: (userId: number) => boolean
  ): void {
    if (!this.chatMessages) return;
    for (const node of Array.from(this.chatMessages.children)) {
      const message = node as HTMLElement;
      if (!message.dataset.id) continue; // the history row, system notices
      const userId = Number(message.dataset.userId);
      const name = message.dataset.name ?? '';
      const author = userId ? resolve(userId) : { avatarUrl: null, login: null, role: null };

      const url = author.avatarUrl ?? '';
      if (url !== message.dataset.avatar) {
        message.dataset.avatar = url;
        message.firstElementChild?.replaceWith(createAvatar(name, 'md', undefined, url || null));
      }

      const next = {
        name,
        sentAtMs: Number(message.dataset.sentAt),
        login: author.login,
        role: author.role,
        canDelete: canDelete(userId),
      };
      if (metaKey(next) === message.dataset.meta) continue;
      message
        .querySelector('.lobby-message-meta')
        ?.replaceWith(this.buildMessageMeta(message, next));
    }
  }

  /** Drop a deleted message. */
  removeMessage(messageId: number): void {
    this.chatMessages?.querySelector(`.lobby-message[data-id="${messageId}"]`)?.remove();
    this.setHistoryState(this.hasMoreHistory, this.loadingHistory);
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
    this.closeLinkPopover(); // it would drift away from its link
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
    this.narrowQuery?.removeEventListener('change', this.onNarrowChange);
    window.visualViewport?.removeEventListener('resize', this.onViewportResize);
    this.closeUserCard();
    this.closeLinkPopover();
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.chatMessages?.removeEventListener('scroll', this.onMessagesScroll);
    this.chatMessages = null;
    this.historyStatus = null;
    this.newMessagesButton = null;
    this.chatInput = null;
    this.sendButton = null;
    this.manageButton = null;
    this.createChannelButton = null;
    this.voicePanel = null;
    this.headerVoice = null;
    this.usersList = null;
    this.usersCount = null;
    this.roomsList = null;
    this.headerTitle = null;
    this.headerOnline = null;
    this.meSection = null;
    this.userSearchInput = null;
    this.container = null;
    this.sidebar = null;
    this.header = null;
    this.members = [];
    this.rooms.clear();
  }
}
