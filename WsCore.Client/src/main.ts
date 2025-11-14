import MyApp from './2d/App';
import MyApp3D from './3d/App3D';
import LobbyApp from './lobby/LobbyApp';

// Global app instance
let app: MyApp | MyApp3D | LobbyApp;

// Global functions for HTML onclick handlers
function onStartGameClicked() {
  runGame();
}

function runGame() {
  const form = document.getElementById('name-form');
  const modeSelection = document.getElementById('mode-selection') as HTMLSelectElement;
  const textbox = document.getElementById('name-text-input') as HTMLInputElement;
  form.style.display = 'none';

  // Get mode from selection or URL parameter
  const mode = new URLSearchParams(window.location.search).get('mode') || modeSelection?.value || '2d';

  if (mode === '3d') {
    app = new MyApp3D();
  } else if (mode === 'chat') {
    app = new LobbyApp();
  } else {
    app = new MyApp();
  }

  const userName = textbox.value;
  app.playerName = userName;
}

// Make functions global for HTML access
(window as any).onStartGameClicked = onStartGameClicked;
(window as any).runGame = runGame;

// Auto-run on DOM load
// document.addEventListener('DOMContentLoaded', () => runGame());
