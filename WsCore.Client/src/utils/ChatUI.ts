import styles from './ChatUI.css?inline';

/**
 * Chat UI overlay component used by the in-game (3D) state.
 */
export default class ChatUI {
  private chatOverlay: HTMLDivElement | null = null;
  private chatMessages: HTMLDivElement | null = null;
  private chatInput: HTMLInputElement | null = null;
  private chatButton: HTMLButtonElement | null = null;
  private inputContainer: HTMLDivElement | null = null;
  private isVisible: boolean = true;
  private messageCallback: ((message: string) => void) | null = null;
  private maxMessages: number = 50;
  private static cssLoaded = false;

  constructor() {
    // Load CSS only once
    if (!ChatUI.cssLoaded) {
      ChatUI.loadCSS();
      ChatUI.cssLoaded = true;
    }
    this.initializeUI();
  }

  /**
   * Inject the chat CSS. Imported via `?inline` so it survives the single-file
   * production build — the old `<link href="/src/utils/ChatUI.css">` 404'd there
   * and left the in-game chat unstyled (audit §5).
   */
  private static loadCSS(): void {
    const styleElement = document.createElement('style');
    styleElement.textContent = styles;
    document.head.appendChild(styleElement);
  }

  /**
   * Initialize the chat UI overlay
   */
  private initializeUI(): void {
    // Create main overlay div
    this.chatOverlay = document.createElement('div');
    this.chatOverlay.id = 'chat-overlay';

    // Create title bar
    const titleBar = document.createElement('div');
    titleBar.className = 'chat-title-bar';

    const titleText = document.createElement('span');
    titleText.textContent = 'Chat';
    titleBar.appendChild(titleText);

    // Create toggle button
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'chat-toggle-btn';
    toggleBtn.textContent = '−';
    toggleBtn.onclick = () => this.toggleMinimize(toggleBtn);
    titleBar.appendChild(toggleBtn);

    this.chatOverlay.appendChild(titleBar);

    // Create messages container
    this.chatMessages = document.createElement('div');
    this.chatMessages.className = 'chat-messages';
    this.chatOverlay.appendChild(this.chatMessages);

    // Create input container
    const inputContainer = document.createElement('div');
    inputContainer.className = 'chat-input-container';

    // Create input field
    this.chatInput = document.createElement('input');
    this.chatInput.type = 'text';
    this.chatInput.className = 'chat-input';
    this.chatInput.placeholder = 'Type message...';
    this.chatInput.onkeypress = e => {
      if (e.key === 'Enter') {
        this.sendMessage();
      }
    };
    inputContainer.appendChild(this.chatInput);

    // Create send button
    this.chatButton = document.createElement('button');
    this.chatButton.className = 'chat-button';
    this.chatButton.textContent = 'Send';
    this.chatButton.onclick = () => this.sendMessage();
    inputContainer.appendChild(this.chatButton);

    this.inputContainer = inputContainer;
    this.chatOverlay.appendChild(inputContainer);

    // Add to document
    document.body.appendChild(this.chatOverlay);
  }

  /**
   * Set callback for when message is sent
   */
  setOnMessageCallback(callback: (message: string) => void): void {
    this.messageCallback = callback;
  }

  /**
   * Send chat message
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
   * Add message to chat display
   */
  addMessage(playerName: string, message: string): void {
    if (!this.chatMessages) return;

    const messageElement = document.createElement('div');
    messageElement.className = 'chat-message';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'chat-player-name';
    nameSpan.textContent = playerName;

    const textSpan = document.createElement('span');
    textSpan.className = 'chat-message-text';
    textSpan.textContent = message;

    messageElement.appendChild(nameSpan);
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
   * Clear all messages
   */
  clearMessages(): void {
    if (this.chatMessages) {
      this.chatMessages.innerHTML = '';
    }
  }

  /**
   * Toggle minimize/maximize
   */
  private toggleMinimize(toggleBtn: HTMLButtonElement): void {
    const isMinimized = this.chatMessages?.style.display === 'none';

    if (isMinimized) {
      // Expand
      if (this.chatMessages) this.chatMessages.style.display = 'block';
      if (this.inputContainer) this.inputContainer.style.display = 'flex';
      if (this.chatOverlay) this.chatOverlay.style.height = '400px';
      toggleBtn.textContent = '−';
    } else {
      // Minimize
      if (this.chatMessages) this.chatMessages.style.display = 'none';
      if (this.inputContainer) this.inputContainer.style.display = 'none';
      if (this.chatOverlay) this.chatOverlay.style.height = 'auto';
      toggleBtn.textContent = '+';
    }
  }

  /**
   * Get visibility state
   */
  isVisibleNow(): boolean {
    return this.isVisible;
  }

  /**
   * Focus on input field
   */
  focusInput(): void {
    this.chatInput?.focus();
  }

  /**
   * Destroy chat UI (cleanup)
   */
  destroy(): void {
    if (this.chatOverlay && this.chatOverlay.parentNode) {
      this.chatOverlay.parentNode.removeChild(this.chatOverlay);
    }
    this.chatMessages = null;
    this.chatInput = null;
    this.chatButton = null;
    this.chatOverlay = null;
  }
}
