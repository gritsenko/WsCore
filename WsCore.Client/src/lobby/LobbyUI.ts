import styles from './LobbyUI.css?inline';

/**
 * Discord-style Lobby UI with chat and user list
 */
export default class LobbyUI {
  private container: HTMLDivElement | null = null;
  private usersList: HTMLDivElement | null = null;
  private chatMessages: HTMLDivElement | null = null;
  private chatInput: HTMLInputElement | null = null;
  private roomsList: HTMLDivElement | null = null;
  private messageCallback: ((message: string) => void) | null = null;
  private roomJoinCallback: ((roomId: string) => void) | null = null;
  private users: Map<number, string> = new Map();
  private rooms: Map<string, { name: string; userCount: number }> = new Map();
  private currentUserId: number = -1;
  private currentRoomId: string = 'lobby';
  private maxMessages: number = 100;
  private static cssLoaded = false;

  constructor() {
    if (!LobbyUI.cssLoaded) {
      LobbyUI.loadCSS();
      LobbyUI.cssLoaded = true;
    }
    this.initializeUI();
    this.initializeDefaultRooms();
  }

  /**
   * Load the lobby CSS styles
   */
  private static loadCSS(): void {
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }

  /**
   * Initialize default rooms
   */
  private initializeDefaultRooms(): void {
    this.rooms.set('lobby', { name: 'Lobby', userCount: 0 });
    this.rooms.set('voice', { name: 'Voice Room', userCount: 0 });
    this.rooms.set('2d-game', { name: '2D Game Room', userCount: 0 });
    this.rooms.set('3d-game', { name: '3D Game Room', userCount: 0 });
  }

  /**
   * Initialize the Discord-style lobby UI
   */
  private initializeUI(): void {
    // Main container
    this.container = document.createElement('div');
    this.container.id = 'lobby-container';

    // Left sidebar with rooms and users
    const leftSidebar = document.createElement('div');
    leftSidebar.className = 'lobby-left-sidebar';

    // Rooms section
    const roomsSection = document.createElement('div');
    roomsSection.className = 'lobby-rooms-section';

    const roomsTitle = document.createElement('div');
    roomsTitle.className = 'lobby-rooms-title';
    roomsTitle.textContent = 'Rooms';
    roomsSection.appendChild(roomsTitle);

    this.roomsList = document.createElement('div');
    this.roomsList.className = 'lobby-rooms-list';
    roomsSection.appendChild(this.roomsList);

    leftSidebar.appendChild(roomsSection);

    // Users section
    const usersSection = document.createElement('div');
    usersSection.className = 'lobby-users-section';

    const usersTitle = document.createElement('div');
    usersTitle.className = 'lobby-users-title';
    usersTitle.textContent = 'Users Online';
    usersSection.appendChild(usersTitle);

    this.usersList = document.createElement('div');
    this.usersList.className = 'lobby-users-list';
    usersSection.appendChild(this.usersList);

    leftSidebar.appendChild(usersSection);

    this.container.appendChild(leftSidebar);

    // Main chat area
    const chatArea = document.createElement('div');
    chatArea.className = 'lobby-chat-area';

    // Chat header
    const chatHeader = document.createElement('div');
    chatHeader.className = 'lobby-chat-header';
    const headerTitle = document.createElement('span');
    headerTitle.className = 'lobby-chat-header-title';
    headerTitle.textContent = 'Lobby Chat';
    chatHeader.appendChild(headerTitle);
    chatArea.appendChild(chatHeader);

    // Messages container
    this.chatMessages = document.createElement('div');
    this.chatMessages.className = 'lobby-messages';
    chatArea.appendChild(this.chatMessages);

    // Input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'lobby-input-container';

    this.chatInput = document.createElement('input');
    this.chatInput.type = 'text';
    this.chatInput.className = 'lobby-input';
    this.chatInput.placeholder = 'Type your message...';
    this.chatInput.onkeypress = e => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    };
    inputContainer.appendChild(this.chatInput);

    const sendBtn = document.createElement('button');
    sendBtn.className = 'lobby-send-btn';
    sendBtn.textContent = 'Send';
    sendBtn.onclick = () => this.sendMessage();
    inputContainer.appendChild(sendBtn);

    chatArea.appendChild(inputContainer);

    this.container.appendChild(chatArea);

    // Add to document
    document.body.appendChild(this.container);

    // Clear any default margins/padding
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';

    // Update the rooms display
    this.updateRoomsList();
  }

  /**
   * Set callback for when room is joined
   */
  setOnRoomJoinCallback(callback: (roomId: string) => void): void {
    this.roomJoinCallback = callback;
  }

  /**
   * Update room list display
   */
  private updateRoomsList(): void {
    if (!this.roomsList) return;

    this.roomsList.innerHTML = '';

    for (const [roomId, room] of this.rooms) {
      const roomElement = document.createElement('div');
      roomElement.className = 'lobby-room-item';

      // Highlight current room
      if (roomId === this.currentRoomId) {
        roomElement.classList.add('lobby-room-current');
      }

      // Room name and Play button container
      const roomContent = document.createElement('div');
      roomContent.className = 'lobby-room-content';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'lobby-room-name';
      nameSpan.textContent = room.name;
      roomContent.appendChild(nameSpan);

      // Add Play button for game rooms
      if (roomId === '2d-game' || roomId === '3d-game') {
        const playButton = document.createElement('button');
        playButton.className = 'lobby-play-btn';
        playButton.textContent = 'Play';
        playButton.onclick = e => {
          e.stopPropagation(); // Prevent triggering room join
          this.handlePlayButtonClick(roomId);
        };
        roomContent.appendChild(playButton);
      }

      roomElement.appendChild(roomContent);

      // User count badge for all rooms
      const countBadge = document.createElement('span');
      countBadge.className = 'lobby-room-count';
      countBadge.textContent = room.userCount.toString();
      roomElement.appendChild(countBadge);

      // Click handler for room join (for all rooms to join as chat)
      roomElement.onclick = e => {
        // Don't trigger if Play button was clicked
        if ((e.target as HTMLElement).classList.contains('lobby-play-btn')) {
          return;
        }

        // Join room as chat for all rooms
        if (this.roomJoinCallback && roomId !== this.currentRoomId) {
          this.roomJoinCallback(roomId);
        }
      };

      this.roomsList.appendChild(roomElement);
    }
  }

  /**
   * Handle Play button click
   */
  private handlePlayButtonClick(roomId: string): void {
    console.log(`Play button clicked for room: ${roomId}`);
    // Dispatch a custom event that the main app can listen to
    const event = new CustomEvent('lobbyPlayGame', { detail: { roomId } });
    document.dispatchEvent(event);
  }

  /**
   * Update room user count
   */
  updateRoomUserCount(roomId: string, userCount: number): void {
    const room = this.rooms.get(roomId);
    if (room) {
      room.userCount = userCount;
      this.updateRoomsList();
    }
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
  setCurrentUserId(userId: number): void {
    this.currentUserId = userId;
  }

  /**
   * Set current room
   */
  setCurrentRoom(roomId: string): void {
    this.currentRoomId = roomId;
    const room = this.rooms.get(roomId);
    const headerTitle = this.container?.querySelector(
      '.lobby-chat-header-title'
    ) as HTMLSpanElement;
    if (headerTitle && room) {
      headerTitle.textContent = room.name;
    }
    this.updateRoomsList();
  }

  /**
   * Update the users list display
   */
  private updateUsersList(): void {
    if (!this.usersList) return;

    this.usersList.innerHTML = '';

    // Sort users by ID for consistent display
    const sortedUsers = Array.from(this.users.entries()).sort((a, b) => a[0] - b[0]);

    for (const [userId, userName] of sortedUsers) {
      const userElement = document.createElement('div');
      userElement.className = 'lobby-user-item';

      // Online indicator
      const indicator = document.createElement('div');
      indicator.className = 'lobby-user-indicator';
      userElement.appendChild(indicator);

      // User name
      const nameSpan = document.createElement('span');
      nameSpan.className = 'lobby-user-name';
      nameSpan.textContent = userName;
      userElement.appendChild(nameSpan);

      // Highlight current user
      if (userId === this.currentUserId) {
        userElement.classList.add('lobby-current-user');
      }

      this.usersList.appendChild(userElement);
    }

    // Add user count
    const countElement = document.createElement('div');
    countElement.className = 'lobby-user-count';
    countElement.textContent = `${this.users.size} online`;
    this.usersList.appendChild(countElement);
  }

  /**
   * Add message to chat
   */
  addMessage(userName: string, message: string, isOwnMessage: boolean = false): void {
    if (!this.chatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = 'lobby-message';

    if (isOwnMessage) {
      messageElement.classList.add('lobby-message-own');
    }

    // Timestamp
    const time = new Date();
    const timeSpan = document.createElement('span');
    timeSpan.className = 'lobby-message-time';
    timeSpan.textContent = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageElement.appendChild(timeSpan);

    // Username
    const userSpan = document.createElement('span');
    userSpan.className = 'lobby-message-user';
    userSpan.textContent = userName;
    messageElement.appendChild(userSpan);

    // Message text
    const textSpan = document.createElement('span');
    textSpan.className = 'lobby-message-text';
    textSpan.textContent = message;
    messageElement.appendChild(textSpan);

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
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
    }
    this.chatMessages = null;
    this.chatInput = null;
    this.usersList = null;
    this.roomsList = null;
    this.container = null;
    this.users.clear();
    this.rooms.clear();
  }
}
