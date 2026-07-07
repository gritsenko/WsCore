export interface KeyHandle {
  code: number;
  isDown: boolean;
  isUp: boolean;
  press?: () => void;
  release?: () => void;
  down: (event: KeyboardEvent) => void;
  up: (event: KeyboardEvent) => void;
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
    };

    key.down = (event: KeyboardEvent) => {
      if (event.keyCode === key.code) {
        if (key.isUp && key.press) key.press();
        key.isDown = true;
        key.isUp = false;
        event.preventDefault();
      }
    };

    key.up = (event: KeyboardEvent) => {
      if (event.keyCode === key.code) {
        if (key.isDown && key.release) key.release();
        key.isDown = false;
        key.isUp = true;
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', key.down, false);
    window.addEventListener('keyup', key.up, false);
    return key;
  }

  static removeHandler(key: KeyHandle | null | undefined): void {
    if (!key) return;
    window.removeEventListener('keydown', key.down, false);
    window.removeEventListener('keyup', key.up, false);
    key.press = undefined;
    key.release = undefined;
  }
}
