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
  console.log('Environment check:', { isDev, protocol: window.location.protocol, hostname: window.location.hostname, port: window.location.port });
  
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

  // Listen for Play button clicks
  setupLobbyEventListeners(userName);
  
  // Listen for Back to Lobby button clicks
  setupBackToLobbyListener();
}

/**
 * Setup event listener for returning to lobby
 */
function setupBackToLobbyListener() {
  // Remove existing listener first
  document.removeEventListener('gameReturnToLobby', handleGameReturnToLobby as any);
  
  handleGameReturnToLobby = () => {
    console.log('Returning to lobby from game');
    
    // Clean up current app
    cleanupCurrentApp();
    
    // Return to lobby
    startLobby();
  };
  
  document.addEventListener('gameReturnToLobby', handleGameReturnToLobby);
}

/**
 * Start or return to lobby
 */
function startLobby(playerName?: string) {
  const nameToUse = playerName || 'User';
  
  const gameContainer = document.getElementById('game');
  if (gameContainer) {
    gameContainer.innerHTML = ''; // Clear any existing content
  }

  app = new LobbyApp(getWebSocketUrl());
  app.playerName = nameToUse;
  app.setPlayerName(nameToUse);

  // Re-setup event listeners
  setupLobbyEventListeners(nameToUse);
  setupBackToLobbyListener();
}

/**
 * Setup event listeners for lobby interactions
 */
function setupLobbyEventListeners(playerName: string) {
  // Remove existing listener first
  document.removeEventListener('lobbyPlayGame', handleLobbyPlayGame as any);
  
  handleLobbyPlayGame = (event: any) => {
    const { roomId } = event.detail;
    console.log(`Switching to game mode: ${roomId}`);
    
    // Clean up current app based on type
    cleanupCurrentApp();

    // Switch to appropriate game mode
    if (roomId === '2d-game') {
      start2DGame(playerName);
    } else if (roomId === '3d-game') {
      start3DGame(playerName);
    }
  };
  
  document.addEventListener('lobbyPlayGame', handleLobbyPlayGame);
}

/**
 * Clean up current app
 */
function cleanupCurrentApp() {
  try {
    if (app instanceof LobbyApp) {
      app.destroy();
    } else if (app instanceof MyApp) {
      // Clean up 2D game
      console.log('Cleaning up 2D game...');
      if (app.phaserGame) {
        app.phaserGame.destroy(true, false); // remove canvas, don't clear DOM
      }
      // Clear game container
      const gameContainer = document.getElementById('game');
      if (gameContainer) {
        gameContainer.innerHTML = '';
      }
    } else if (app instanceof MyApp3D) {
      // Clean up 3D game
      console.log('Cleaning up 3D game...');
      if (app.renderer) {
        // Clean up Three.js scene
        app.renderer.dispose();
        // Clear the DOM element
        const canvas = app.renderer.domElement;
        if (canvas && canvas.parentNode) {
          canvas.parentNode.removeChild(canvas);
        }
      }
      // Clear game container
      const gameContainer = document.getElementById('game');
      if (gameContainer) {
        gameContainer.innerHTML = '';
      }
    }
    
    // Clear any remaining Back to Lobby buttons
    const backButtons = document.querySelectorAll('div[style*="Back to Lobby"]');
    backButtons.forEach(btn => btn.remove());
    
    // Clear any game-related event listeners
    document.removeEventListener('lobbyPlayGame', handleLobbyPlayGame as any);
    document.removeEventListener('gameReturnToLobby', handleGameReturnToLobby as any);
    
    // Reset app reference
    app = undefined as any;
    
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

// Keep references to event handlers for cleanup
let handleLobbyPlayGame: (event: any) => void;
let handleGameReturnToLobby: () => void;

/**
 * Start 2D game mode
 */
function start2DGame(playerName: string) {
  const gameContainer = document.getElementById('game');
  if (gameContainer) {
    gameContainer.innerHTML = ''; // Clear any existing content
  }

  const gameApp = new MyApp(getWebSocketUrl());
  (gameApp as any).playerName = playerName;
  app = gameApp;
}

/**
 * Start 3D game mode
 */
function start3DGame(playerName: string) {
  const gameContainer = document.getElementById('game');
  if (gameContainer) {
    gameContainer.innerHTML = ''; // Clear any existing content
  }

  const gameApp = new MyApp3D(getWebSocketUrl());
  (gameApp as any).playerName = playerName;
  app = gameApp;
}

// Make functions global for HTML access
(window as any).onStartGameClicked = onStartGameClicked;
(window as any).runGame = runGame;

// Auto-run on DOM load
// document.addEventListener('DOMContentLoaded', () => runGame());
