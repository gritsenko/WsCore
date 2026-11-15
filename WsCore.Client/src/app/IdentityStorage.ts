/**
 * What this browser remembers about who we are (localStorage; every access is guarded —
 * storage can be unavailable in private mode or with site data blocked):
 *  - the user key: a random secret that IS our identity for the server. For a guest it
 *    is the only way back to the user; for a claimed account it is this device's login.
 *  - the last display name, to prefill the name form.
 */
const NAME_STORAGE_KEY = 'wscore.userName';
const USER_KEY_STORAGE_KEY = 'wscore.userKey';
const USER_KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;

export function loadSavedName(): string {
  try {
    return localStorage.getItem(NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string): void {
  try {
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch {
    // Not persisted — the name still works for this session.
  }
}

/** A fresh random user key (48 hex characters). */
export function createUserKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function saveUserKey(key: string): void {
  try {
    localStorage.setItem(USER_KEY_STORAGE_KEY, key);
  } catch {
    // Not persisted — we are a new user (or logged out) on the next load.
  }
}

/**
 * Our stable identity, created on the first visit and sent to the server on every
 * connect, so it knows us as the same user across reloads. If storage is unavailable
 * the key lasts for this page load only.
 */
export function loadOrCreateUserKey(): string {
  try {
    const saved = localStorage.getItem(USER_KEY_STORAGE_KEY);
    if (saved && USER_KEY_PATTERN.test(saved)) return saved;
  } catch {
    // Fall through: a per-page-load key.
  }
  const key = createUserKey();
  saveUserKey(key);
  return key;
}

/** Forget who we are on this device (after logging out of an account). */
export function clearIdentity(): void {
  try {
    localStorage.removeItem(USER_KEY_STORAGE_KEY);
    localStorage.removeItem(NAME_STORAGE_KEY);
  } catch {
    // Nothing was persisted.
  }
}
