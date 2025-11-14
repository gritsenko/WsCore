/**
 * Discord-style Lobby UI with chat and user list
 */
export default class LobbyUI {
  private container: HTMLDivElement | null = null;
  private usersList: HTMLDivElement | null = null;
  private chatMessages: HTMLDivElement | null = null;
  private chatInput: HTMLInputElement | null = null;
  private messageCallback: ((message: string) => void) | null = null;
  private users: Map<number, string> = new Map();
  private currentUserId: number = -1;
  private maxMessages: number = 100;
  private static cssLoaded = false;

  constructor() {
    if (!LobbyUI.cssLoaded) {
      LobbyUI.loadCSS();
      LobbyUI.cssLoaded = true;
    }
    this.initializeUI();
  }

  /**
   * Load the lobby CSS file
   */
  private static loadCSS(): void {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/src/lobby/LobbyUI.css';
    document.head.appendChild(link);
  }

  /**
   * Initialize the Discord-style lobby UI
   */
  private initializeUI(): void {
    // Main container
    this.container = document.createElement('div');
    this.container.id = 'lobby-container';

    // Sidebar with users list
    const sidebar = document.createElement('div');
    sidebar.className = 'lobby-sidebar';

    const sidebarTitle = document.createElement('div');
    sidebarTitle.className = 'lobby-sidebar-title';
    sidebarTitle.textContent = 'Users Online';
    sidebar.appendChild(sidebarTitle);

    this.usersList = document.createElement('div');
    this.usersList.className = 'lobby-users-list';
    sidebar.appendChild(this.usersList);

    this.container.appendChild(sidebar);

    // Main chat area
    const chatArea = document.createElement('div');
    chatArea.className = 'lobby-chat-area';

    // Chat header
    const chatHeader = document.createElement('div');
    chatHeader.className = 'lobby-chat-header';
    const headerTitle = document.createElement('span');
    headerTitle.textContent = 'General Chat';
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
    this.chatInput.onkeypress = (e) => {
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
  }

  /**
   * Set current user ID for message display
   */
  setCurrentUserId(userId: number): void {
    this.currentUserId = userId;
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
    this.container = null;
    this.users.clear();
  }
}
