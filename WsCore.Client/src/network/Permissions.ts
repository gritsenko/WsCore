/**
 * Roles and permissions per channel (room), Telegram-style — the client's mirror of the
 * server's `ChannelPermissions`. The server enforces everything; the client uses this to
 * show who is an admin, to offer only the actions that would be accepted, and to say why
 * the input is disabled.
 *
 *  * A server admin has every right in every channel.
 *  * A channel admin has the rights it was given (+ an optional title).
 *  * Everyone else has the channel's default permissions, minus what a restriction of
 *    theirs denies (a ban denies everything). Admins are never restricted.
 *  * A private channel is seen only by server admins, its admins and the members given
 *    access (the server does not even list it for anyone else).
 *
 * Pure state (no socket, no DOM), so it is unit-tested directly.
 */

/** Admin rights in a channel (server `ChannelRights`). */
export enum ChannelRight {
  DeleteMessages = 1,
  /** Mute / ban members and change the channel's default permissions. */
  RestrictMembers = 2,
  /** Promote / demote admins (never with more rights than one's own). */
  AddAdmins = 4,
  /** Give / take away access to a private channel. */
  InviteUsers = 8,
  All = 15,
}

/** What a member may do (server `MemberPermissions`). */
export enum MemberPermission {
  SendMessages = 1,
  SendLinks = 2,
  All = 3,
}

/** ModerationResultEvent.action on the wire (server `ModerationAction`). */
export enum ModerationAction {
  SetAdmin = 1,
  Restrict = 2,
  SetDefaults = 3,
  SetServerAdmin = 4,
  DeleteMessage = 5,
  SendMessage = 6,
  CreateChannel = 7,
  UpdateChannel = 8,
  DeleteChannel = 9,
  SetAccess = 10,
}

export interface ModerationResult {
  action: ModerationAction;
  success: boolean;
  /** Server `ModerationError` code ("forbidden", "muted"…); null on success. */
  error: string | null;
  /** The channel the action was about (for CreateChannel: the new channel). */
  roomId: string | null;
}

export interface ChannelAdmin {
  userId: number;
  rights: number;
  /** Custom title; '' = the default label. */
  title: string;
}

export interface ChannelRestriction {
  userId: number;
  /** MemberPermission flags taken away. */
  denied: number;
  banned: boolean;
  /** Unix ms when it ends; 0 = forever. */
  untilMs: number;
}

export interface ChannelPermissions {
  roomId: string;
  defaults: number;
  admins: Map<number, ChannelAdmin>;
  restrictions: Map<number, ChannelRestriction>;
  /** Only admins and the members given access see and enter it. */
  isPrivate: boolean;
  /** The users given access (meaningful while private). */
  members: Set<number>;
}

/** Whoever the rules are asked about: a user id plus whether they are a server admin. */
export interface Subject {
  userId: number;
  isAdmin: boolean;
}

export function isRestrictionActive(r: ChannelRestriction, nowMs: number): boolean {
  return (r.denied !== 0 || r.banned) && (r.untilMs === 0 || r.untilMs > nowMs);
}

export class PermissionStore {
  private readonly channels = new Map<string, ChannelPermissions>();
  /** Replaceable in tests (restriction expiry). */
  now: () => number = () => Date.now();

  /** Replace everything (reset) or only the channels given. */
  apply(channels: ChannelPermissions[], reset: boolean): void {
    if (reset) this.channels.clear();
    for (const channel of channels) this.channels.set(channel.roomId, channel);
  }

  clear(): void {
    this.channels.clear();
  }

  channel(roomId: string): ChannelPermissions {
    return (
      this.channels.get(roomId) ?? {
        roomId,
        defaults: MemberPermission.All,
        admins: new Map(),
        restrictions: new Map(),
        isPrivate: false,
        members: new Set(),
      }
    );
  }

  admin(roomId: string, userId: number): ChannelAdmin | undefined {
    return this.channels.get(roomId)?.admins.get(userId);
  }

  /** The user's active restriction in the channel (expired ones do not count). */
  restriction(roomId: string, userId: number): ChannelRestriction | undefined {
    const r = this.channels.get(roomId)?.restrictions.get(userId);
    return r && isRestrictionActive(r, this.now()) ? r : undefined;
  }

  rightsOf(who: Subject | undefined, roomId: string): number {
    if (!who || !who.userId) return 0;
    if (who.isAdmin) return ChannelRight.All;
    return this.admin(roomId, who.userId)?.rights ?? 0;
  }

  has(who: Subject | undefined, roomId: string, right: ChannelRight): boolean {
    return (this.rightsOf(who, roomId) & right) === right;
  }

  /** What `who` may do in the channel; an anonymous user (undefined) gets the defaults. */
  permissionsOf(who: Subject | undefined, roomId: string): number {
    if (this.rightsOf(who, roomId) !== 0) return MemberPermission.All;
    const defaults = this.channel(roomId).defaults;
    const r = who ? this.restriction(roomId, who.userId) : undefined;
    if (!r) return defaults;
    return r.banned ? 0 : defaults & ~r.denied;
  }

  isBanned(who: Subject | undefined, roomId: string): boolean {
    if (!who || this.rightsOf(who, roomId) !== 0) return false;
    return this.restriction(roomId, who.userId)?.banned === true;
  }

  /** Whether `userId` was given access to the (private) channel. */
  hasAccess(roomId: string, userId: number): boolean {
    return this.channels.get(roomId)?.members.has(userId) ?? false;
  }

  /** Whether `who` may delete a message written by `authorId` in the channel. */
  canDelete(who: Subject | undefined, roomId: string, authorId: number): boolean {
    if (!who || !who.userId) return false;
    return authorId === who.userId || this.has(who, roomId, ChannelRight.DeleteMessages);
  }

  /** Whether `who` sees the channel's management dialog (holds any admin right there). */
  canManage(who: Subject | undefined, roomId: string): boolean {
    return this.rightsOf(who, roomId) !== 0;
  }

  /**
   * The label shown next to a user's name in the channel: the custom title, else
   * "админ" for a channel or server admin; null for everyone else.
   */
  roleLabel(who: Subject | undefined, roomId: string): string | null {
    if (!who || !who.userId) return null;
    const admin = this.admin(roomId, who.userId);
    if (admin?.title) return admin.title;
    if (who.isAdmin) return 'админ сервера';
    return admin ? 'админ' : null;
  }
}

/** Server `ModerationError` codes, as the UI words them. */
export const MODERATION_ERRORS: Record<string, string> = {
  not_identified: 'Сервер ещё не знает вас — попробуйте через секунду',
  no_channel: 'Такого канала нет',
  no_user: 'Пользователь не найден',
  no_message: 'Сообщение слишком старое — удалить его может только модератор',
  forbidden: 'Недостаточно прав',
  not_claimed: 'Администратором может быть только закреплённый аккаунт (с логином)',
  target_is_admin: 'Нельзя ограничить администратора — сначала снимите права',
  self: 'Нельзя изменить собственную роль',
  home_room: 'В общем канале можно только запретить писать, но не заблокировать',
  configured: 'Этот администратор задан в настройках сервера',
  muted: 'Вам запрещено писать в этом канале',
  banned: 'Вы заблокированы в этом канале',
  links_forbidden: 'В этом канале нельзя отправлять ссылки',
  too_fast: 'Слишком часто — попробуйте через секунду',
  no_access: 'Это закрытый канал — попросите администратора дать вам доступ',
  bad_name: 'Укажите название канала',
  too_many: 'Создано слишком много каналов',
  built_in: 'Встроенный канал нельзя изменить или удалить',
};

export function describeModerationError(error: string | null): string {
  return MODERATION_ERRORS[error ?? ''] ?? 'Не получилось. Попробуйте ещё раз';
}

/** "до 12 нояб., 14:05" / "навсегда". */
export function formatUntil(untilMs: number): string {
  if (!untilMs) return 'навсегда';
  const date = new Date(untilMs);
  return `до ${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
}
