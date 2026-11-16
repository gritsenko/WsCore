import { createAvatar, el } from './LobbyUI';
import { ChannelRight, MemberPermission, formatUntil } from '../network/Permissions';

/** A known user as the channel dialog shows them. */
export interface ChannelUser {
  userId: number;
  name: string;
  /** Public login of a claimed account; null for a guest (who cannot be an admin). */
  login: string | null;
  avatarUrl: string | null;
  isServerAdmin: boolean;
  /** Their admin role in this channel. */
  admin: { rights: number; title: string } | null;
  /** Their active restriction in this channel. */
  restriction: { denied: number; banned: boolean; untilMs: number } | null;
  isSelf: boolean;
}

export interface ChannelDialogView {
  roomId: string;
  roomName: string;
  /** The room every connection lands in: it can mute, but not ban. */
  isHomeRoom: boolean;
  /** Our admin rights here (ChannelRight flags; all of them for a server admin). */
  myRights: number;
  iAmServerAdmin: boolean;
  /** MemberPermission flags every member has. */
  defaults: number;
  /** Every known user. */
  users: ChannelUser[];
  /** The channels we may manage (a picker switches between them when there are several). */
  channels: { id: string; name: string }[];
}

export interface ChannelDialogHandlers {
  onSetDefaults(defaults: number): void;
  onSetAdmin(userId: number, rights: number, title: string): void;
  onRestrict(userId: number, denied: number, banned: boolean, durationSeconds: number): void;
  onSetServerAdmin(userId: number, isAdmin: boolean): void;
  /** Manage another channel instead. */
  onSwitchChannel(roomId: string): void;
  onClose(): void;
}

type Tab = 'permissions' | 'admins' | 'restricted';
type Page =
  | { kind: 'tab' }
  | { kind: 'pick'; purpose: 'admin' | 'restrict' }
  | { kind: 'member'; userId: number };

const RIGHTS: { flag: ChannelRight; label: string; hint: string }[] = [
  {
    flag: ChannelRight.DeleteMessages,
    label: 'Удаление сообщений',
    hint: 'Удалять сообщения любых участников',
  },
  {
    flag: ChannelRight.RestrictMembers,
    label: 'Блокировка участников',
    hint: 'Запрещать писать, блокировать, менять разрешения канала',
  },
  {
    flag: ChannelRight.AddAdmins,
    label: 'Назначение администраторов',
    hint: 'Только с теми правами, которые есть у вас',
  },
];

const PERMISSIONS: { flag: MemberPermission; label: string }[] = [
  { flag: MemberPermission.SendMessages, label: 'Отправка сообщений' },
  { flag: MemberPermission.SendLinks, label: 'Отправка ссылок' },
];

const DURATIONS: [seconds: number, label: string][] = [
  [0, 'Навсегда'],
  [3600, 'На 1 час'],
  [86400, 'На 1 день'],
  [7 * 86400, 'На 1 неделю'],
];

export const TITLE_MAX_LENGTH = 16;

/** "без права писать · до 12 нояб., 14:05" */
export function describeRestriction(r: {
  denied: number;
  banned: boolean;
  untilMs: number;
}): string {
  const what = r.banned
    ? 'заблокирован(а)'
    : r.denied & MemberPermission.SendMessages
      ? 'без права писать'
      : 'без права отправлять ссылки';
  return `${what} · ${formatUntil(r.untilMs)}`;
}

/** "Удаление сообщений, Блокировка участников" */
function describeRights(rights: number): string {
  const names = RIGHTS.filter(r => rights & r.flag).map(r => r.label.toLowerCase());
  return names.length ? names.join(', ') : 'без прав';
}

function roleOf(user: ChannelUser): string | null {
  if (user.admin?.title) return user.admin.title;
  if (user.isServerAdmin) return 'админ сервера';
  return user.admin ? 'админ' : null;
}

/**
 * Channel management, Telegram-style ("Управление группой", per channel here):
 *  * Разрешения — what every member may do;
 *  * Администраторы — who holds which rights (+ a title), promote / demote;
 *  * Ограничения — muted / banned members;
 * and one member's page (their rights, their restriction, the server-admin role).
 *
 * Purely presentational, like ProfileDialog: it reports what the user did through the
 * handlers; the server's answer and the resulting state come back through update() and
 * showStatus(). A page is rebuilt only when what it shows changed, so a presence update
 * arriving mid-edit does not wipe the form.
 */
export default class ChannelDialog {
  private readonly overlay: HTMLDivElement;
  private readonly handlers: ChannelDialogHandlers;
  private view: ChannelDialogView;
  private tab: Tab = 'permissions';
  private page: Page = { kind: 'tab' };
  private filter = '';

  private readonly subtitle: HTMLDivElement;
  private readonly channelPicker: HTMLSelectElement;
  private readonly back: HTMLButtonElement;
  private readonly tabs: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private renderedKey = '';

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    if (this.page.kind === 'tab') this.handlers.onClose();
    else this.goBack();
  };

  constructor(view: ChannelDialogView, handlers: ChannelDialogHandlers) {
    this.view = view;
    this.handlers = handlers;
    this.tab = view.myRights & ChannelRight.RestrictMembers ? 'permissions' : 'admins';

    this.overlay = el('div', 'lobby-dialog-overlay');
    this.overlay.onpointerdown = e => {
      if (e.target === this.overlay) handlers.onClose();
    };

    const dialog = el('div', 'lobby-dialog lobby-channel-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-label', 'Управление каналом');
    this.overlay.appendChild(dialog);

    const header = el('div', 'lobby-dialog-header');
    this.back = el('button', 'lobby-dialog-close lobby-dialog-back', '←');
    this.back.type = 'button';
    this.back.setAttribute('aria-label', 'Назад');
    this.back.onclick = () => this.goBack();
    const heading = el('div', 'lobby-channel-heading');
    heading.appendChild(el('span', 'lobby-dialog-title', 'Управление каналом'));
    this.subtitle = el('div', 'lobby-channel-subtitle');
    heading.appendChild(this.subtitle);
    this.channelPicker = el('select', 'lobby-channel-picker');
    this.channelPicker.setAttribute('aria-label', 'Канал');
    this.channelPicker.onchange = () => handlers.onSwitchChannel(this.channelPicker.value);
    heading.appendChild(this.channelPicker);
    const close = el('button', 'lobby-dialog-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', 'Закрыть');
    close.onclick = () => handlers.onClose();
    header.append(this.back, heading, close);
    dialog.appendChild(header);

    this.tabs = el('div', 'lobby-channel-tabs');
    dialog.appendChild(this.tabs);
    this.body = el('div', 'lobby-channel-body');
    dialog.appendChild(this.body);
    this.status = el('div', 'lobby-dialog-status lobby-channel-status');
    this.status.hidden = true;
    dialog.appendChild(this.status);

    this.render();
    (document.getElementById('lobby-container') ?? document.body).appendChild(this.overlay);
    document.addEventListener('keydown', this.onKeyDown);
  }

  get roomId(): string {
    return this.view.roomId;
  }

  /** Roles, permissions or the member list changed: refresh what is shown. */
  update(view: ChannelDialogView): void {
    if (view.roomId !== this.view.roomId) {
      // Another channel: start over at its tabs.
      this.page = { kind: 'tab' };
      this.showStatus('');
    }
    this.view = view;
    this.render();
  }

  /** Open one member's page (from their card in the member list). */
  openMember(userId: number): void {
    this.page = { kind: 'member', userId };
    this.showStatus('');
    this.render();
  }

  showStatus(text: string, isError = false): void {
    this.status.textContent = text;
    this.status.hidden = !text;
    this.status.classList.toggle('lobby-dialog-status-error', isError);
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown);
    this.overlay.remove();
  }

  // ---- navigation ----

  private goBack(): void {
    this.page = { kind: 'tab' };
    this.showStatus('');
    this.render();
  }

  private go(page: Page): void {
    this.page = page;
    this.filter = '';
    this.showStatus('');
    this.render();
  }

  private get canRestrict(): boolean {
    return (this.view.myRights & ChannelRight.RestrictMembers) !== 0;
  }

  private get canAddAdmins(): boolean {
    return (this.view.myRights & ChannelRight.AddAdmins) !== 0;
  }

  private user(userId: number): ChannelUser | undefined {
    return this.view.users.find(u => u.userId === userId);
  }

  // ---- rendering ----

  // What the current page shows: it is rebuilt only when this changes.
  private pageKey(): string {
    const v = this.view;
    const base = `${v.roomId}|${v.myRights}|${v.iAmServerAdmin}|${JSON.stringify(this.page)}`;
    switch (this.page.kind) {
      case 'tab':
        if (this.tab === 'permissions') return `${base}|${this.tab}|${v.defaults}`;
        return `${base}|${this.tab}|${JSON.stringify(v.users.filter(u => u.admin || u.isServerAdmin || u.restriction))}`;
      case 'pick':
        return `${base}|${JSON.stringify(v.users.map(u => [u.userId, u.name, u.login, !!u.admin, u.isServerAdmin]))}`;
      case 'member':
        return `${base}|${v.isHomeRoom}|${JSON.stringify(this.user(this.page.userId) ?? null)}`;
    }
  }

  private render(): void {
    const { channels } = this.view;
    this.subtitle.textContent = this.view.roomName;
    this.subtitle.hidden = channels.length > 1;
    this.channelPicker.hidden = channels.length <= 1;
    const pickerKey = channels.map(c => `${c.id}:${c.name}`).join('|');
    if (this.channelPicker.dataset.key !== pickerKey) {
      this.channelPicker.dataset.key = pickerKey;
      this.channelPicker.replaceChildren(
        ...channels.map(c => {
          const option = el('option', undefined, c.name);
          option.value = c.id;
          return option;
        })
      );
    }
    this.channelPicker.value = this.view.roomId;
    this.back.hidden = this.page.kind === 'tab';
    this.tabs.hidden = this.page.kind !== 'tab';

    const key = this.pageKey();
    if (key === this.renderedKey) return;
    this.renderedKey = key;

    this.renderTabs();
    switch (this.page.kind) {
      case 'tab':
        if (this.tab === 'permissions') this.renderPermissions();
        else if (this.tab === 'admins') this.renderAdmins();
        else this.renderRestricted();
        break;
      case 'pick':
        this.renderPicker(this.page.purpose);
        break;
      case 'member':
        this.renderMember(this.page.userId);
        break;
    }
  }

  private renderTabs(): void {
    const tabs: [Tab, string][] = [
      ['permissions', 'Разрешения'],
      ['admins', 'Администраторы'],
      ['restricted', 'Ограничения'],
    ];
    this.tabs.replaceChildren(
      ...tabs.map(([tab, label]) => {
        const button = el('button', 'lobby-channel-tab', label);
        button.type = 'button';
        button.classList.toggle('lobby-channel-tab-active', tab === this.tab);
        button.onclick = () => {
          this.tab = tab;
          this.showStatus('');
          this.render();
        };
        return button;
      })
    );
  }

  private renderPermissions(): void {
    const editable = this.canRestrict;
    const boxes = PERMISSIONS.map(p =>
      checkbox(p.label, (this.view.defaults & p.flag) !== 0, !editable)
    );
    const children: Node[] = [
      el(
        'div',
        'lobby-dialog-hint',
        'Что могут делать все участники канала. На администраторов это не действует; ' +
          'отдельным участникам права можно урезать во вкладке «Ограничения».'
      ),
      el('div', 'lobby-dialog-label', 'Участники могут'),
      ...boxes.map(b => b.row),
    ];
    if (editable) {
      const save = button('Сохранить', 'primary', () => {
        let defaults = 0;
        PERMISSIONS.forEach((p, i) => {
          if (boxes[i].input.checked) defaults |= p.flag;
        });
        this.handlers.onSetDefaults(defaults);
      });
      children.push(buttonRow(save));
    } else {
      children.push(
        el('div', 'lobby-dialog-hint', 'Менять разрешения может администратор с правом блокировки.')
      );
    }
    this.body.replaceChildren(...children);
  }

  private renderAdmins(): void {
    const admins = this.view.users
      .filter(u => u.admin || u.isServerAdmin)
      .sort(
        (a, b) => Number(b.isServerAdmin) - Number(a.isServerAdmin) || a.name.localeCompare(b.name)
      );
    const children: Node[] = [];
    if (this.canAddAdmins) {
      children.push(
        buttonRow(
          button('+ Назначить администратора', 'primary', () =>
            this.go({ kind: 'pick', purpose: 'admin' })
          )
        )
      );
    }
    const list = el('div', 'lobby-channel-list');
    for (const user of admins) {
      const detail = user.isServerAdmin
        ? 'все права во всех каналах'
        : describeRights(user.admin?.rights ?? 0);
      list.appendChild(this.userRow(user, detail));
    }
    if (admins.length === 0)
      list.appendChild(el('div', 'lobby-dialog-hint', 'Администраторов нет.'));
    children.push(list);
    this.body.replaceChildren(...children);
  }

  private renderRestricted(): void {
    const restricted = this.view.users
      .filter(u => u.restriction)
      .sort((a, b) => a.name.localeCompare(b.name));
    const children: Node[] = [];
    if (this.canRestrict) {
      children.push(
        buttonRow(
          button('+ Ограничить участника', 'primary', () =>
            this.go({ kind: 'pick', purpose: 'restrict' })
          )
        )
      );
    }
    const list = el('div', 'lobby-channel-list');
    for (const user of restricted)
      list.appendChild(this.userRow(user, describeRestriction(user.restriction!)));
    if (restricted.length === 0)
      list.appendChild(el('div', 'lobby-dialog-hint', 'Никто не ограничен.'));
    children.push(list);
    this.body.replaceChildren(...children);
  }

  private renderPicker(purpose: 'admin' | 'restrict'): void {
    const candidates = this.view.users.filter(u =>
      purpose === 'admin'
        ? !u.isServerAdmin && !u.admin && u.login !== null && !u.isSelf
        : !u.isServerAdmin && !u.admin && !u.isSelf
    );
    const search = el('input', 'lobby-dialog-input');
    search.type = 'search';
    search.placeholder = 'Имя или логин…';
    search.value = this.filter;
    const list = el('div', 'lobby-channel-list');
    const fill = () => {
      const q = this.filter.toLowerCase();
      const shown = candidates
        .filter(u => !q || u.name.toLowerCase().includes(q) || (u.login ?? '').includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
      list.replaceChildren(
        ...shown.map(u =>
          this.userRow(u, u.restriction ? describeRestriction(u.restriction) : undefined)
        )
      );
      if (shown.length === 0) list.appendChild(el('div', 'lobby-dialog-hint', 'Никого не найдено'));
    };
    search.oninput = () => {
      this.filter = search.value.trim();
      fill();
    };
    fill();
    const hint =
      purpose === 'admin'
        ? 'Администратором можно сделать только закреплённый аккаунт (с логином).'
        : 'Кого ограничить в этом канале.';
    this.body.replaceChildren(el('div', 'lobby-dialog-hint', hint), search, list);
    search.focus();
  }

  private userRow(user: ChannelUser, detail?: string): HTMLButtonElement {
    const row = el('button', 'lobby-channel-user');
    row.type = 'button';
    row.appendChild(createAvatar(user.name, 'sm', undefined, user.avatarUrl));
    const text = el('div', 'lobby-channel-user-text');
    const top = el('div', 'lobby-channel-user-name');
    top.appendChild(el('span', undefined, user.name));
    if (user.login) top.appendChild(el('span', 'lobby-message-login', `@${user.login}`));
    const role = roleOf(user);
    if (role) top.appendChild(el('span', 'lobby-role-badge', role));
    text.appendChild(top);
    if (detail) text.appendChild(el('div', 'lobby-channel-user-detail', detail));
    row.appendChild(text);
    row.onclick = () => this.go({ kind: 'member', userId: user.userId });
    return row;
  }

  private renderMember(userId: number): void {
    const user = this.user(userId);
    if (!user) {
      this.body.replaceChildren(el('div', 'lobby-dialog-hint', 'Пользователь не найден.'));
      return;
    }
    const v = this.view;
    const children: Node[] = [];

    const head = el('div', 'lobby-dialog-avatar-row');
    head.appendChild(createAvatar(user.name, 'lg', undefined, user.avatarUrl));
    const who = el('div', 'lobby-dialog-avatar-actions');
    who.appendChild(el('div', 'lobby-channel-member-name', user.name));
    const identity = el('div', 'lobby-dialog-identity');
    identity.appendChild(
      user.login
        ? el('span', 'lobby-dialog-identity-login', `@${user.login}`)
        : el('span', 'lobby-dialog-identity-guest', 'гость')
    );
    const role = roleOf(user);
    if (role) identity.appendChild(el('span', 'lobby-role-badge', role));
    who.appendChild(identity);
    if (user.restriction)
      who.appendChild(
        el('div', 'lobby-channel-user-detail', describeRestriction(user.restriction))
      );
    head.appendChild(who);
    children.push(head);

    children.push(...this.adminSection(user));
    children.push(...this.restrictionSection(user));

    if (v.iAmServerAdmin && !user.isSelf) {
      children.push(sectionTitle('Администратор сервера'));
      if (!user.login && !user.isServerAdmin) {
        children.push(hint('Только для закреплённого аккаунта (с логином).'));
      } else {
        children.push(
          hint(
            user.isServerAdmin
              ? 'Все права во всех каналах, может назначать других администраторов сервера.'
              : 'Даст все права во всех каналах.'
          ),
          buttonRow(
            button(
              user.isServerAdmin
                ? 'Снять права администратора сервера'
                : 'Сделать администратором сервера',
              user.isServerAdmin ? 'quiet' : 'normal',
              () => this.handlers.onSetServerAdmin(user.userId, !user.isServerAdmin)
            )
          )
        );
      }
    }

    if (children.length === 1)
      children.push(hint('У вас нет прав, чтобы что-то изменить для этого участника.'));
    this.body.replaceChildren(...children);
  }

  private adminSection(user: ChannelUser): Node[] {
    const v = this.view;
    if (!this.canAddAdmins) return [];
    const nodes: Node[] = [sectionTitle('Администратор канала')];
    if (user.isSelf && !v.iAmServerAdmin) return [...nodes, hint('Свою роль изменить нельзя.')];
    if (user.isServerAdmin && !v.iAmServerAdmin)
      return [...nodes, hint('Администратор сервера: все права во всех каналах.')];
    if (!user.login && !user.admin)
      return [...nodes, hint('Назначить можно только закреплённый аккаунт (с логином).')];
    const current = user.admin?.rights ?? 0;
    if (!v.iAmServerAdmin && (current & ~v.myRights) !== 0)
      return [...nodes, hint('У этого администратора есть права, которых нет у вас.')];

    // A server admin already has everything: here only the title matters.
    const rightsBoxes = user.isServerAdmin
      ? []
      : RIGHTS.map(r => {
          const box = checkbox(
            r.label,
            (current & r.flag) !== 0,
            (v.myRights & r.flag) === 0,
            r.hint
          );
          return { flag: r.flag, ...box };
        });
    const title = el('input', 'lobby-dialog-input');
    title.type = 'text';
    title.maxLength = TITLE_MAX_LENGTH;
    title.placeholder = 'Звание (необязательно), например «модератор»';
    title.value = user.admin?.title ?? '';

    const save = button(user.admin ? 'Сохранить' : 'Назначить', 'primary', () => {
      let rights = user.isServerAdmin ? ChannelRight.All : 0;
      for (const box of rightsBoxes) if (box.input.checked) rights |= box.flag;
      if (rights === 0) {
        this.showStatus('Отметьте хотя бы одно право — или разжалуйте', true);
        return;
      }
      this.handlers.onSetAdmin(user.userId, rights, title.value.trim());
    });
    const row = buttonRow(save);
    if (user.admin) {
      row.appendChild(
        button(user.isServerAdmin ? 'Убрать звание' : 'Разжаловать', 'quiet', () =>
          this.handlers.onSetAdmin(user.userId, 0, '')
        )
      );
    }
    nodes.push(
      ...rightsBoxes.map(b => b.row),
      el('div', 'lobby-dialog-label', 'Звание'),
      title,
      row
    );
    return nodes;
  }

  private restrictionSection(user: ChannelUser): Node[] {
    const v = this.view;
    if (!this.canRestrict || user.isSelf) return [];
    const nodes: Node[] = [sectionTitle('Ограничения в канале')];
    if (user.admin || user.isServerAdmin)
      return [...nodes, hint('Администратора нельзя ограничить — сначала снимите права.')];

    const r = user.restriction;
    const canWrite = checkbox(
      'Может писать сообщения',
      !r || (!r.banned && (r.denied & MemberPermission.SendMessages) === 0),
      false
    );
    const canLink = checkbox(
      'Может отправлять ссылки',
      !r || (!r.banned && (r.denied & MemberPermission.SendLinks) === 0),
      false
    );
    const ban = checkbox(
      'Заблокировать в канале',
      r?.banned ?? false,
      false,
      'Не сможет войти в канал; кто внутри — вернётся в общий канал'
    );
    const sync = () => {
      canWrite.input.disabled = canLink.input.disabled = ban.input.checked;
    };
    ban.input.onchange = sync;
    sync();

    const duration = el('select', 'lobby-dialog-input lobby-channel-select');
    for (const [seconds, label] of DURATIONS) {
      const option = el('option', undefined, label);
      option.value = String(seconds);
      duration.appendChild(option);
    }

    const apply = button('Применить', 'primary', () => {
      let denied = 0;
      if (!canWrite.input.checked) denied |= MemberPermission.SendMessages;
      if (!canLink.input.checked) denied |= MemberPermission.SendLinks;
      const banned = !v.isHomeRoom && ban.input.checked;
      if (denied === 0 && !banned) {
        this.showStatus('Ничего не запрещено — используйте «Снять ограничения»', true);
        return;
      }
      this.handlers.onRestrict(user.userId, denied, banned, Number(duration.value));
    });
    const row = buttonRow(apply);
    if (r)
      row.appendChild(
        button('Снять ограничения', 'quiet', () =>
          this.handlers.onRestrict(user.userId, 0, false, 0)
        )
      );

    nodes.push(canWrite.row, canLink.row);
    if (!v.isHomeRoom) nodes.push(ban.row);
    nodes.push(el('div', 'lobby-dialog-label', 'Срок'), duration, row);
    return nodes;
  }
}

// ---- small builders ----

function checkbox(
  label: string,
  checked: boolean,
  disabled: boolean,
  hintText?: string
): { row: HTMLLabelElement; input: HTMLInputElement } {
  const row = el('label', 'lobby-channel-check');
  const input = el('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.disabled = disabled;
  row.appendChild(input);
  const text = el('span', 'lobby-channel-check-text');
  text.appendChild(el('span', undefined, label));
  if (hintText) text.appendChild(el('span', 'lobby-channel-check-hint', hintText));
  row.appendChild(text);
  return { row, input };
}

function button(
  label: string,
  kind: 'primary' | 'normal' | 'quiet',
  onClick: () => void
): HTMLButtonElement {
  const cls =
    kind === 'primary'
      ? 'lobby-dialog-button lobby-dialog-button-primary'
      : kind === 'quiet'
        ? 'lobby-dialog-button lobby-dialog-button-quiet'
        : 'lobby-dialog-button';
  const b = el('button', cls, label);
  b.type = 'button';
  b.onclick = onClick;
  return b;
}

function buttonRow(...buttons: HTMLElement[]): HTMLDivElement {
  const row = el('div', 'lobby-dialog-buttons');
  row.append(...buttons);
  return row;
}

function sectionTitle(text: string): HTMLDivElement {
  return el('div', 'lobby-dialog-section-title lobby-channel-section', text);
}

function hint(text: string): HTMLDivElement {
  return el('div', 'lobby-dialog-hint', text);
}
