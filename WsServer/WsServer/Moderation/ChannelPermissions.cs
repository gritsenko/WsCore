using Game.ServerLogic.Moderation.Events;
using WsServer.Persistence;
using WsServer.Sessions;

namespace WsServer.Moderation;

/// <summary>A user's standing in one channel: admin rights + title and / or a restriction.</summary>
public sealed class ChannelMember(uint userId)
{
    public uint UserId { get; } = userId;
    public byte AdminRights { get; set; }
    public string Title { get; set; } = string.Empty;
    public byte Denied { get; set; }
    public bool Banned { get; set; }
    /// <summary>Unix ms when the restriction ends; 0 = forever.</summary>
    public long UntilMs { get; set; }

    public bool IsAdmin => AdminRights != 0;
    public bool HasRestriction => Denied != 0 || Banned;

    public bool IsRestrictedAt(long nowMs) => HasRestriction && (UntilMs == 0 || UntilMs > nowMs);
}

/// <summary>
/// Who may do what in each channel (room), Telegram-style:
///  * a server admin (<see cref="UserAccount.IsAdmin"/>) has every right everywhere;
///  * a channel admin has the <see cref="ChannelRights"/> it was given (and a title);
///  * everyone else has the channel's default <see cref="MemberPermissions"/>, minus what a
///    restriction of theirs denies (a ban denies everything, including entering).
/// Admins are never restricted. Restrictions expire by themselves (checked on use).
///
/// Pure state + persistence (write-behind through <see cref="IChatStorage"/>); the rules
/// about who may change it live in <see cref="ModerationService"/>. Tick thread only.
/// </summary>
public sealed class ChannelPermissions
{
    private sealed class Channel
    {
        public byte DefaultPermissions = MemberPermissions.All;
        public readonly Dictionary<uint, ChannelMember> Members = new();
    }

    private readonly IChatStorage _storage;
    private readonly Dictionary<string, Channel> _channels = new();

    /// <summary>Replaceable in tests (restriction expiry).</summary>
    public Func<long> NowMs { get; set; } = () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    public ChannelPermissions(IChatStorage storage, StorageSnapshot snapshot)
    {
        _storage = storage;
        foreach (var c in snapshot.Channels)
            Get(c.RoomId).DefaultPermissions = (byte)(c.DefaultPermissions & MemberPermissions.All);
        foreach (var m in snapshot.ChannelMembers)
        {
            Get(m.RoomId).Members[m.UserId] = new ChannelMember(m.UserId)
            {
                AdminRights = (byte)(m.AdminRights & ChannelRights.All),
                Title = m.Title,
                Denied = (byte)(m.Denied & MemberPermissions.All),
                Banned = m.Banned,
                UntilMs = m.UntilMs,
            };
        }
    }

    // ---- queries ----------------------------------------------------------------------

    public byte DefaultPermissions(string roomId)
        => _channels.TryGetValue(roomId, out var c) ? c.DefaultPermissions : MemberPermissions.All;

    public ChannelMember? Member(string roomId, uint userId)
        => _channels.TryGetValue(roomId, out var c) ? c.Members.GetValueOrDefault(userId) : null;

    /// <summary>The user's admin rights in the channel (all of them for a server admin).</summary>
    public byte RightsOf(UserAccount? user, string roomId)
    {
        if (user == null)
            return 0;
        if (user.IsAdmin)
            return ChannelRights.All;
        return Member(roomId, user.Id)?.AdminRights ?? 0;
    }

    public bool Has(UserAccount? user, string roomId, byte right) => (RightsOf(user, roomId) & right) == right;

    /// <summary>What the user may do in the channel; an anonymous connection gets the defaults.</summary>
    public byte PermissionsOf(UserAccount? user, string roomId)
    {
        if (RightsOf(user, roomId) != 0)
            return MemberPermissions.All;
        var permissions = DefaultPermissions(roomId);
        if (user != null && ActiveRestriction(roomId, user.Id) is { } r)
            permissions = r.Banned ? (byte)0 : (byte)(permissions & ~r.Denied);
        return permissions;
    }

    public bool IsBanned(UserAccount? user, string roomId)
        => user != null && RightsOf(user, roomId) == 0 && ActiveRestriction(roomId, user.Id)?.Banned == true;

    private ChannelMember? ActiveRestriction(string roomId, uint userId)
        => Member(roomId, userId) is { } m && m.IsRestrictedAt(NowMs()) ? m : null;

    // ---- changes ----------------------------------------------------------------------

    public void SetDefaults(string roomId, byte permissions)
    {
        var channel = Get(roomId);
        channel.DefaultPermissions = (byte)(permissions & MemberPermissions.All);
        _storage.SaveChannel(new StoredChannel(roomId, channel.DefaultPermissions));
    }

    /// <summary>Promotes / updates (rights != 0) or demotes (rights == 0). Promoting lifts any restriction.</summary>
    public void SetAdmin(string roomId, uint userId, byte rights, string title)
    {
        rights &= ChannelRights.All;
        var member = GetMember(roomId, userId);
        member.AdminRights = rights;
        member.Title = rights == 0 ? string.Empty : title;
        if (rights != 0)
            ClearRestriction(member);
        Save(roomId, member);
    }

    /// <summary>Restricts (denied / banned) or, with neither, lifts the restriction.</summary>
    public void SetRestriction(string roomId, uint userId, byte denied, bool banned, long untilMs)
    {
        var member = GetMember(roomId, userId);
        member.Denied = (byte)(denied & MemberPermissions.All);
        member.Banned = banned;
        member.UntilMs = member.HasRestriction ? untilMs : 0;
        Save(roomId, member);
    }

    private static void ClearRestriction(ChannelMember member)
    {
        member.Denied = 0;
        member.Banned = false;
        member.UntilMs = 0;
    }

    private Channel Get(string roomId)
    {
        if (!_channels.TryGetValue(roomId, out var channel))
            _channels[roomId] = channel = new Channel();
        return channel;
    }

    private ChannelMember GetMember(string roomId, uint userId)
    {
        var channel = Get(roomId);
        if (!channel.Members.TryGetValue(userId, out var member))
            channel.Members[userId] = member = new ChannelMember(userId);
        return member;
    }

    // A member that is neither admin nor restricted is no longer worth a row.
    private void Save(string roomId, ChannelMember member)
    {
        if (!member.IsAdmin && !member.HasRestriction)
        {
            Get(roomId).Members.Remove(member.UserId);
            _storage.DeleteChannelMember(roomId, member.UserId);
            return;
        }
        _storage.SaveChannelMember(new StoredChannelMember(roomId, member.UserId)
        {
            AdminRights = member.AdminRights,
            Title = member.Title,
            Denied = member.Denied,
            Banned = member.Banned,
            UntilMs = member.UntilMs,
        });
    }

    // ---- wire -------------------------------------------------------------------------

    public ChannelPermissionsInfo Describe(string roomId)
    {
        var info = new ChannelPermissionsInfo { RoomId = roomId, DefaultPermissions = DefaultPermissions(roomId) };
        if (!_channels.TryGetValue(roomId, out var channel))
            return info;

        var now = NowMs();
        foreach (var m in channel.Members.Values.OrderBy(m => m.UserId))
        {
            if (m.IsAdmin)
                info.Admins.Add(new ChannelAdminInfo { UserId = m.UserId, Rights = m.AdminRights, Title = m.Title });
            if (m.IsRestrictedAt(now))
            {
                info.Restrictions.Add(new ChannelRestrictionInfo
                {
                    UserId = m.UserId, Denied = m.Denied, Banned = m.Banned, UntilMs = m.UntilMs,
                });
            }
        }
        return info;
    }
}
