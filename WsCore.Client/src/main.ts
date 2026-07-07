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

/** Entry point wired to the #name-form submit button. */
function onStartGameClicked(): void {
  const form = document.getElementById('name-form');
  const textbox = document.getElementById('name-text-input') as HTMLInputElement | null;
  if (form) form.style.display = 'none';

  const userName = textbox?.value || 'User';

  app = new App(getWebSocketUrl());
  app.setPlayerName(userName);
  app.start();
}

// Expose for the inline onclick handler in index.html.
(window as any).onStartGameClicked = onStartGameClicked;
(window as any).runGame = onStartGameClicked;
