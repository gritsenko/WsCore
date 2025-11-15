import MyApp from './2d/App';
import MyApp3D from './3d/App3D';
import LobbyApp from './lobby/LobbyApp';

// Global app instance
let app: MyApp | MyApp3D | LobbyApp;

/**
 * Get the WebSocket server URL
 * Uses port 5000 in development, current port in production
 */
function getWebSocketUrl(customUrl?: string): string {
  if (customUrl) {
    return customUrl;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const hostname = window.location.hostname;

  // In development, use port 5000; in production, use current port
  let port = '';
  const isDev = import.meta.env.DEV;
  if (isDev) {
    port = ':5000';
  } else if (window.location.port) {
    port = ':' + window.location.port;
  }

  return `${protocol}//${hostname}${port}/ws`;
}

// Global functions for HTML onclick handlers
function onStartGameClicked() {
  runGame();
}

function runGame() {
  const form = document.getElementById('name-form');
  const textbox = document.getElementById('name-text-input') as HTMLInputElement;
  form.style.display = 'none';

  const userName = textbox.value || 'User';

  // Always use Lobby mode as default
  app = new LobbyApp(getWebSocketUrl());
  app.playerName = userName;
  app.setPlayerName(userName);
}

// Make functions global for HTML access
(window as any).onStartGameClicked = onStartGameClicked;
(window as any).runGame = runGame;

// Auto-run on DOM load
// document.addEventListener('DOMContentLoaded', () => runGame());
