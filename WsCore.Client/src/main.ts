import App from './app/App';

let app: App | null = null;

/**
 * WebSocket server URL. Dev hard-codes port 5000; production uses current origin.
 */
function getWebSocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;

  let port = '';
  if (import.meta.env.DEV) {
    port = ':5000';
  } else if (window.location.port) {
    port = ':' + window.location.port;
  }

  return `${protocol}//${hostname}${port}/ws`;
}

const NAME_STORAGE_KEY = 'wscore.userName';

/** Last login name; storage can be unavailable (private mode, blocked site data). */
function loadSavedName(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Not persisted — the name still works for this session.
  }
}

/** Entry point wired to the #name-form submit button. */
function onStartGameClicked(): void {
  const form = document.getElementById('name-form');
  const textbox = document.getElementById('name-text-input') as HTMLInputElement | null;
  if (form) form.style.display = 'none';

  const userName = textbox?.value.trim() || 'User';
  if (textbox?.value.trim()) saveName(userName);

  app = new App(getWebSocketUrl());
  app.setPlayerName(userName);
  app.start();
}

// Prefill the name form with the last login.
const nameInput = document.getElementById('name-text-input') as HTMLInputElement | null;
if (nameInput && !nameInput.value) nameInput.value = loadSavedName();

// Expose for the inline onclick handler in index.html.
(window as any).onStartGameClicked = onStartGameClicked;
(window as any).runGame = onStartGameClicked;
