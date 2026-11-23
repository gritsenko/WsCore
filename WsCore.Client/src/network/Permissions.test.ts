import { describe, it, expect } from 'vitest';
import { ChannelPermissions, ChannelRight, MemberPermission, PermissionStore } from './Permissions';

function channel(
  roomId: string,
  opts: {
    defaults?: number;
    admins?: [number, number, string][];
    restrictions?: [number, number, boolean, number][];
    isPrivate?: boolean;
    members?: number[];
  } = {}
): ChannelPermissions {
  return {
    roomId,
    defaults: opts.defaults ?? MemberPermission.All,
    admins: new Map(
      (opts.admins ?? []).map(([userId, rights, title]) => [userId, { userId, rights, title }])
    ),
    restrictions: new Map(
      (opts.restrictions ?? []).map(([userId, denied, banned, untilMs]) => [
        userId,
        { userId, denied, banned, untilMs },
      ])
    ),
    isPrivate: opts.isPrivate ?? false,
    members: new Set(opts.members ?? []),
  };
}

const user = (userId: number, isAdmin = false) => ({ userId, isAdmin });

describe('PermissionStore', () => {
  it('a server admin has every right everywhere, even in unknown channels', () => {
    const store = new PermissionStore();
    expect(store.rightsOf(user(1, true), 'anywhere')).toBe(ChannelRight.All);
    expect(store.canManage(user(1, true), 'anywhere')).toBe(true);
    expect(store.roleLabel(user(1, true), 'anywhere')).toBe('админ сервера');
  });

  it('a channel admin has its rights only in its channel, with its title', () => {
    const store = new PermissionStore();
    store.apply(
      [channel('lobby', { admins: [[2, ChannelRight.DeleteMessages, 'модератор']] })],
      true
    );

    expect(store.has(user(2), 'lobby', ChannelRight.DeleteMessages)).toBe(true);
    expect(store.has(user(2), 'lobby', ChannelRight.RestrictMembers)).toBe(false);
    expect(store.rightsOf(user(2), 'voice')).toBe(0);
    expect(store.roleLabel(user(2), 'lobby')).toBe('модератор');
    expect(store.roleLabel(user(2), 'voice')).toBeNull();
    // Deleting: anyone's with the right, otherwise one's own only.
    expect(store.canDelete(user(2), 'lobby', 7)).toBe(true);
    expect(store.canDelete(user(3), 'lobby', 7)).toBe(false);
    expect(store.canDelete(user(3), 'lobby', 3)).toBe(true);
  });

  it('members get the defaults minus their restriction, until it expires', () => {
    const store = new PermissionStore();
    store.now = () => 1000;
    store.apply(
      [
        channel('lobby', {
          defaults: MemberPermission.SendMessages, // no links for anyone
          restrictions: [
            [3, MemberPermission.SendMessages, false, 2000],
            [4, 0, true, 0],
          ],
        }),
      ],
      true
    );

    expect(store.permissionsOf(user(2), 'lobby')).toBe(MemberPermission.SendMessages);
    expect(store.permissionsOf(user(3), 'lobby')).toBe(0);
    expect(store.isBanned(user(4), 'lobby')).toBe(true);
    expect(store.permissionsOf(undefined, 'lobby')).toBe(MemberPermission.SendMessages);

    store.now = () => 2500; // user 3's mute ran out
    expect(store.permissionsOf(user(3), 'lobby')).toBe(MemberPermission.SendMessages);
    expect(store.restriction('lobby', 3)).toBeUndefined();
  });

  it('a partial update replaces only its channels; a reset replaces everything', () => {
    const store = new PermissionStore();
    store.apply(
      [channel('lobby', { admins: [[2, 1, '']] }), channel('voice', { admins: [[2, 1, '']] })],
      true
    );
    store.apply([channel('voice')], false);
    expect(store.rightsOf(user(2), 'lobby')).toBe(1);
    expect(store.rightsOf(user(2), 'voice')).toBe(0);

    store.apply([], true);
    expect(store.rightsOf(user(2), 'lobby')).toBe(0);
  });

  it('knows who was given access to a private channel', () => {
    const store = new PermissionStore();
    store.apply([channel('c1', { isPrivate: true, members: [5] })], true);
    expect(store.channel('c1').isPrivate).toBe(true);
    expect(store.hasAccess('c1', 5)).toBe(true);
    expect(store.hasAccess('c1', 6)).toBe(false);
    expect(store.hasAccess('elsewhere', 5)).toBe(false);
    expect(store.channel('unknown').isPrivate).toBe(false);
  });

  it('the invite right is one of all rights', () => {
    expect(ChannelRight.All & ChannelRight.InviteUsers).toBe(ChannelRight.InviteUsers);
  });
});
