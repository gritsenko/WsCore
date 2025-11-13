import MyApp from './2d/App';
import MyApp3D from './3d/App3D';

// Global app instance
let app: MyApp | MyApp3D;

// Global functions for HTML onclick handlers
function onStartGameClicked() {
  runGame();
}

function runGame() {
  const form = document.getElementById('name-form');
  const textbox = document.getElementById('name-text-input') as HTMLInputElement;
  form.style.display = 'none';

  // Check if 3D mode is requested via URL parameter
  const use3D = new URLSearchParams(window.location.search).get('mode') === '3d';

  if (use3D) {
    app = new MyApp3D();
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
document.addEventListener('DOMContentLoaded', () => runGame());
