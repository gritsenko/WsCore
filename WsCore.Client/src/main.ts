import MyApp from './2d/App.js';

// Global app instance
let app: MyApp;

// Global functions for HTML onclick handlers
function onStartGameClicked() {
  runGame();
}

function runGame() {
  const form = document.getElementById('name-form');
  const textbox = document.getElementById('name-text-input') as HTMLInputElement;
  form.style.display = 'none';
  app = new MyApp();
  const userName = textbox.value;
  app.playerName = userName;
}

// Make functions global for HTML access
(window as any).onStartGameClicked = onStartGameClicked;
(window as any).runGame = runGame;

// Auto-run on DOM load
document.addEventListener('DOMContentLoaded', () => runGame());
