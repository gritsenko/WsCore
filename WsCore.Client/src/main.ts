import App from './app/App';
import { createUserKey, loadOrCreateUserKey, loadSavedName, saveName } from './app/IdentityStorage';

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

// The entry form has two modes: quick entry (just a name — we are a guest known by the
// key in this browser) and logging in to a claimed account (login + password).
const form = document.getElementById('name-form');
const nameInput = document.getElementById('name-text-input') as HTMLInputElement | null;
const loginInput = document.getElementById('login-text-input') as HTMLInputElement | null;
const passwordInput = document.getElementById('password-text-input') as HTMLInputElement | null;
const errorLine = document.getElementById('name-form-error');
const toggle = document.getElementById('name-form-toggle');
const submit = document.getElementById('name-form-submit');
let loginMode = false;

const LOGIN_ERRORS: Record<string, string> = {
  bad_credentials: 'Wrong login or password.',
  too_many_attempts: 'Too many attempts. Try again in a minute.',
};

function setMode(login: boolean): void {
  loginMode = login;
  if (form) form.dataset.mode = login ? 'login' : 'guest';
  if (toggle) toggle.textContent = login ? 'Continue as a guest' : 'I have an account';
  if (submit) submit.textContent = login ? 'Log in' : 'Enter Lobby';
  showError('');
  (login ? loginInput : nameInput)?.focus();
}

function showError(text: string): void {
  if (!errorLine) return;
  errorLine.textContent = text;
  errorLine.hidden = !text;
}

/** Entry point wired to the #name-form submit button. */
function onStartGameClicked(): void {
  if (app) return;

  if (loginMode) {
    const login = loginInput?.value.trim() ?? '';
    const password = passwordInput?.value ?? '';
    if (!login || !password) {
      showError('Enter your login and password.');
      return;
    }
    app = new App(getWebSocketUrl());
    app.setPlayerName(login); // shown until the account's name arrives
    // A new key for this device; it is saved only once the server accepted the login.
    app.loginWith(login, password, createUserKey(), error => {
      // Back to the form: nothing of the failed attempt is kept.
      app?.stop();
      app = null;
      if (form) form.style.display = '';
      if (passwordInput) passwordInput.value = '';
      showError(LOGIN_ERRORS[error] ?? 'Could not log in. Try again.');
    });
  } else {
    const userName = nameInput?.value.trim() || 'User';
    if (nameInput?.value.trim()) saveName(userName);
    app = new App(getWebSocketUrl());
    app.setPlayerName(userName);
    app.setUserKey(loadOrCreateUserKey());
  }

  if (form) form.style.display = 'none';
  app.start();
}

// Prefill the name form with the last login.
if (nameInput && !nameInput.value) nameInput.value = loadSavedName();

toggle?.addEventListener('click', e => {
  e.preventDefault();
  setMode(!loginMode);
});
for (const input of [nameInput, loginInput, passwordInput]) {
  input?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) onStartGameClicked();
  });
}

// Expose for the inline onclick handler in index.html.
(window as any).onStartGameClicked = onStartGameClicked;
(window as any).runGame = onStartGameClicked;
