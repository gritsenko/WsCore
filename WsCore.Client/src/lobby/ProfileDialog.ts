import { createAvatar, el } from './LobbyUI';

/** What the profile dialog shows about us. */
export interface ProfileView {
  name: string;
  about: string;
  avatarUrl: string | null;
  /** The account's login once it is claimed; null while we are a guest. */
  login: string | null;
  /** False until the server knows us as a user (nothing can be edited before that). */
  identified: boolean;
}

export interface ProfileHandlers {
  onSave(name: string, about: string): void;
  onAvatarPicked(file: File): void;
  onAvatarRemoved(): void;
  onClaim(login: string, password: string): void;
  onLogout(): void;
  onClose(): void;
}

/** The part of the dialog a status line belongs to. */
export type ProfileSection = 'profile' | 'avatar' | 'account';

export const NAME_MAX_LENGTH = 32;
export const ABOUT_MAX_LENGTH = 190;

/**
 * Our own profile: name, avatar, "about me", and the account — a guest can claim the
 * user with a login + password (so it can be entered from other devices), a claimed
 * account can be left on this device. Purely presentational, like LobbyUI: it reports
 * what the user did through the handlers and shows the outcome it is told.
 */
export default class ProfileDialog {
  private readonly overlay: HTMLDivElement;
  private readonly handlers: ProfileHandlers;
  private view: ProfileView;

  private readonly avatarSlot: HTMLDivElement;
  private readonly removeAvatarButton: HTMLButtonElement;
  private readonly nameInput: HTMLInputElement;
  private readonly aboutInput: HTMLTextAreaElement;
  private readonly aboutCounter: HTMLSpanElement;
  private readonly accountSection: HTMLDivElement;
  private readonly statusLines = new Map<ProfileSection, HTMLDivElement>();
  /** Which view the account section was last built for (rebuilt only when it changes). */
  private accountKey = '';

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.handlers.onClose();
  };

  constructor(view: ProfileView, handlers: ProfileHandlers) {
    this.view = view;
    this.handlers = handlers;

    this.overlay = el('div', 'lobby-dialog-overlay');
    this.overlay.onpointerdown = e => {
      if (e.target === this.overlay) handlers.onClose();
    };

    const dialog = el('div', 'lobby-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Профиль');
    this.overlay.appendChild(dialog);

    const header = el('div', 'lobby-dialog-header');
    header.appendChild(el('span', 'lobby-dialog-title', 'Профиль'));
    const close = el('button', 'lobby-dialog-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');
    close.onclick = () => handlers.onClose();
    header.appendChild(close);
    dialog.appendChild(header);

    // ---- avatar ----
    const avatarRow = el('div', 'lobby-dialog-avatar-row');
    this.avatarSlot = el('div', 'lobby-dialog-avatar');
    avatarRow.appendChild(this.avatarSlot);

    const avatarActions = el('div', 'lobby-dialog-avatar-actions');
    const fileInput = el('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.hidden = true;
    fileInput.id = 'lobby-avatar-file';
    fileInput.onchange = () => {
      const file = fileInput.files?.[0];
      fileInput.value = ''; // picking the same file again must fire `change` again
      if (file) handlers.onAvatarPicked(file);
    };
    const upload = el('button', 'lobby-dialog-button', 'Загрузить аватар');
    upload.type = 'button';
    upload.onclick = () => fileInput.click();
    this.removeAvatarButton = el(
      'button',
      'lobby-dialog-button lobby-dialog-button-quiet',
      'Удалить'
    );
    this.removeAvatarButton.type = 'button';
    this.removeAvatarButton.onclick = () => handlers.onAvatarRemoved();
    const avatarButtons = el('div', 'lobby-dialog-buttons');
    avatarButtons.append(upload, this.removeAvatarButton, fileInput);
    avatarActions.appendChild(avatarButtons);
    avatarActions.appendChild(this.statusLine('avatar'));
    avatarRow.appendChild(avatarActions);
    dialog.appendChild(avatarRow);

    // ---- name + about ----
    dialog.appendChild(el('label', 'lobby-dialog-label', 'Имя'));
    this.nameInput = el('input', 'lobby-dialog-input');
    this.nameInput.type = 'text';
    this.nameInput.maxLength = NAME_MAX_LENGTH;
    this.nameInput.value = view.name;
    dialog.appendChild(this.nameInput);

    const aboutLabel = el('label', 'lobby-dialog-label', 'О себе');
    this.aboutCounter = el('span', 'lobby-dialog-counter');
    aboutLabel.appendChild(this.aboutCounter);
    dialog.appendChild(aboutLabel);
    this.aboutInput = el('textarea', 'lobby-dialog-input lobby-dialog-textarea');
    this.aboutInput.maxLength = ABOUT_MAX_LENGTH;
    this.aboutInput.rows = 3;
    this.aboutInput.placeholder = 'Пара слов о себе — их увидят в вашей карточке';
    this.aboutInput.value = view.about;
    this.aboutInput.oninput = () => this.updateCounter();
    dialog.appendChild(this.aboutInput);

    const saveRow = el('div', 'lobby-dialog-buttons');
    const save = el('button', 'lobby-dialog-button lobby-dialog-button-primary', 'Сохранить');
    save.type = 'button';
    save.onclick = () => {
      const name = this.nameInput.value.trim();
      if (!name) {
        this.showStatus('profile', 'Имя не может быть пустым', true);
        return;
      }
      handlers.onSave(name, this.aboutInput.value.trim());
    };
    saveRow.appendChild(save);
    saveRow.appendChild(this.statusLine('profile'));
    dialog.appendChild(saveRow);

    // ---- account ----
    this.accountSection = el('div', 'lobby-dialog-account');
    dialog.appendChild(this.accountSection);

    this.render();
    this.updateCounter();
    (document.getElementById('lobby-container') ?? document.body).appendChild(this.overlay);
    document.addEventListener('keydown', this.onKeyDown);
  }

  /** Our profile changed on the server (or we got identified): refresh what is shown. */
  update(view: ProfileView): void {
    // What the user is typing is theirs; only fields they have not touched follow.
    if (this.nameInput.value === this.view.name) this.nameInput.value = view.name;
    if (this.aboutInput.value === this.view.about) this.aboutInput.value = view.about;
    this.view = view;
    this.render();
    this.updateCounter();
  }

  /** Show the outcome of an action next to the controls that started it. */
  showStatus(section: ProfileSection, text: string, isError = false): void {
    const line = this.statusLines.get(section);
    if (!line) return;
    line.textContent = text;
    line.hidden = !text;
    line.classList.toggle('lobby-dialog-status-error', isError);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.overlay.remove();
  }

  private statusLine(section: ProfileSection): HTMLDivElement {
    const line = el('div', 'lobby-dialog-status');
    line.hidden = true;
    this.statusLines.set(section, line);
    return line;
  }

  private updateCounter(): void {
    this.aboutCounter.textContent = `${this.aboutInput.value.length}/${ABOUT_MAX_LENGTH}`;
  }

  private render(): void {
    const { view } = this;
    this.avatarSlot.replaceChildren(createAvatar(view.name, 'lg', undefined, view.avatarUrl));
    this.removeAvatarButton.hidden = !view.avatarUrl;

    const accountKey = `${view.identified}|${view.login ?? ''}`;
    if (accountKey === this.accountKey) return;
    this.accountKey = accountKey;
    // The section is rebuilt, so its status line is a new element.
    const status = this.statusLine('account');
    this.accountSection.replaceChildren(el('div', 'lobby-dialog-section-title', 'Аккаунт'));

    if (!view.identified) {
      this.accountSection.appendChild(
        el(
          'div',
          'lobby-dialog-hint',
          'Подключение к серверу… Профиль станет доступен через секунду.'
        )
      );
    } else if (view.login) {
      const line = el('div', 'lobby-dialog-hint', 'Аккаунт закреплён за вами. Логин: ');
      line.appendChild(el('b', 'lobby-dialog-login', view.login));
      this.accountSection.appendChild(line);
      const logout = el(
        'button',
        'lobby-dialog-button lobby-dialog-button-quiet',
        'Выйти на этом устройстве'
      );
      logout.type = 'button';
      logout.onclick = () => this.handlers.onLogout();
      const row = el('div', 'lobby-dialog-buttons');
      row.append(logout, status);
      this.accountSection.appendChild(row);
    } else {
      this.accountSection.appendChild(
        el(
          'div',
          'lobby-dialog-hint',
          'Сейчас вы гость: аккаунт существует только в этом браузере. Задайте логин и пароль, ' +
            'чтобы закрепить его за собой и входить с других устройств.'
        )
      );
      const login = el('input', 'lobby-dialog-input');
      login.type = 'text';
      login.placeholder = 'Логин (латиница, цифры, . _ -)';
      login.maxLength = 32;
      login.autocomplete = 'username';
      login.autocapitalize = 'none';
      login.spellcheck = false;
      const password = el('input', 'lobby-dialog-input');
      password.type = 'password';
      password.placeholder = 'Пароль (не короче 8 символов)';
      password.maxLength = 128;
      password.autocomplete = 'new-password';
      const claim = el(
        'button',
        'lobby-dialog-button lobby-dialog-button-primary',
        'Закрепить аккаунт'
      );
      claim.type = 'button';
      claim.onclick = () => this.handlers.onClaim(login.value.trim(), password.value);
      const row = el('div', 'lobby-dialog-buttons');
      row.append(claim, status);
      this.accountSection.append(login, password, row);
    }
  }
}
