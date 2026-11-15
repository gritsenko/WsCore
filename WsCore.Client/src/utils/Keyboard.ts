export interface KeyHandle {
  code: number;
  isDown: boolean;
  isUp: boolean;
  press?: () => void;
  release?: () => void;
  down: (event: KeyboardEvent) => void;
  up: (event: KeyboardEvent) => void;
  /** Force-release (fires `release` if held). Bound to window blur / focus into a text field. */
  reset: () => void;
  onFocusIn: (event: FocusEvent) => void;
}

/**
 * True when a key event's target is a text-entry element (input, textarea, select,
 * contenteditable), i.e. the keystroke is typing, not a game control. Duck-typed on
 * `tagName` / `isContentEditable` so it is testable without a DOM.
 */
export function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  if (typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export default class Keyboard {
  static KEY_LEFT = 65; //A
  static KEY_UP = 87; //W
  static KEY_RIGHT = 68; //D
  static KEY_DOWN = 83; //S

  static KEY_E = 69;

  static KEY_LEFT_MASK_OFFSET = 2;
  static KEY_UP_MASK_OFFSET = 0;
  static KEY_RIGHT_MASK_OFFSET = 3;
  static KEY_DOWN_MASK_OFFSET = 1;

  /**
   * Register a key. Returns a handle whose exact listener references are stored,
   * so removeHandler() can detach them — the old inline `.bind()` left no way to
   * remove the listeners, leaking 2 per key on every game entry (audit §4.4).
   */
  static addHandler(keyCode: number): KeyHandle {
    const key: KeyHandle = {
      code: keyCode,
      isDown: false,
      isUp: true,
      press: undefined,
      release: undefined,
      down: () => {},
      up: () => {},
      reset: () => {},
      onFocusIn: () => {},
    };

    key.down = (event: KeyboardEvent) => {
      // Typing in the chat box etc. must not move the player or be swallowed.
      if (isEditableTarget(event.target)) return;
      if (event.keyCode === key.code) {
        if (key.isUp && key.press) key.press();
        key.isDown = true;
        key.isUp = false;
        event.preventDefault();
      }
    };

    key.up = (event: KeyboardEvent) => {
      if (event.keyCode === key.code) {
        // Always release a held key (even if focus is now in a text field), but
        // only swallow the event when it isn't typing.
        key.reset();
        if (!isEditableTarget(event.target)) event.preventDefault();
      }
    };

    key.reset = () => {
      if (key.isDown && key.release) key.release();
      key.isDown = false;
      key.isUp = true;
    };

    // A key held while focus moves into a text field (or the window loses focus)
    // would otherwise never see its keyup and stay "stuck down".
    key.onFocusIn = (event: FocusEvent) => {
      if (isEditableTarget(event.target)) key.reset();
    };

    window.addEventListener('keydown', key.down, false);
    window.addEventListener('keyup', key.up, false);
    window.addEventListener('blur', key.reset, false);
    document.addEventListener('focusin', key.onFocusIn, false);
    return key;
  }

  static removeHandler(key: KeyHandle | null | undefined): void {
    if (!key) return;
    window.removeEventListener('keydown', key.down, false);
    window.removeEventListener('keyup', key.up, false);
    window.removeEventListener('blur', key.reset, false);
    document.removeEventListener('focusin', key.onFocusIn, false);
    key.press = undefined;
    key.release = undefined;
  }
}
