using Game.ServerLogic.Moderation.Events;
using WsServer.Persistence;
using WsServer.Sessions;

namespace WsServer.Moderation;

/// <summary>A channel created by an admin (see <see cref="ChannelPermissions.CreatedChannels"/>).</summary>
public sealed record CreatedChannel(string RoomId, string Name, bool IsPrivate, bool IsVoice);

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
    /// <summary>May see and enter the channel while it is private.</summary>
    public bool HasAccess { get; set; }

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
/// Channels and rooms are the same thing: besides the built-in rooms (defined in code)
/// a server admin may create channels (<see cref="CreatedChannel"/>, persisted here and
/// turned into rooms at startup). A private one is seen and entered only by server admins,
/// its own admins and the members given access (<see cref="CanSee"/>).
///
/// Pure state + persistence (write-behind through <see cref="IChatStorage"/>); the rules
/// about who may change it live in <see cref="ModerationService"/>. Tick thread only.
/// </summary>
public sealed class ChannelPermissions
{
    private sealed class Channel
    {
        public byte DefaultPermissions = MemberPermissions.All;
        // Set for a created channel (null = a built-in room, named in code).
        public string? Name;
        public bool IsPrivate;
        public bool IsVoice;
        public long CreatedMs;
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
        {
            var channel = Get(c.RoomId);
            channel.DefaultPermissions = (byte)(c.DefaultPermissions & MemberPermissions.All);
            channel.Name = c.Name;
            channel.IsPrivate = c.Name != null && c.IsPrivate;
            channel.CreatedMs = c.CreatedMs;
            channel.IsVoice = c.Name != null && c.IsVoice;
        }
        foreach (var m in snapshot.ChannelMembers)
        {
            Get(m.RoomId).Members[m.UserId] = new ChannelMember(m.UserId)
            {
                AdminRights = (byte)(m.AdminRights & ChannelRights.All),
                Title = m.Title,
                Denied = (byte)(m.Denied & MemberPermissions.All),
                Banned = m.Banned,
                UntilMs = m.UntilMs,
                HasAccess = m.HasAccess,
            };
        }
    }

    // ---- queries ----------------------------------------------------------------------

    /// <summary>The channels created by admins, oldest first (rooms to create at startup).</summary>
    public IEnumerable<CreatedChannel> CreatedChannels
        => _channels.Where(p => p.Value.Name != null)
            .OrderBy(p => p.Value.CreatedMs).ThenBy(p => p.Key, StringComparer.Ordinal)
            .Select(p => new CreatedChannel(p.Key, p.Value.Name!, p.Value.IsPrivate, p.Value.IsVoice));

    public int CreatedChannelCount => _channels.Values.Count(c => c.Name != null);

    public bool IsCreated(string roomId) => _channels.TryGetValue(roomId, out var c) && c.Name != null;

    public bool IsPrivate(string roomId)
        => (_channels.TryGetValue(roomId, out var c) && c.IsPrivate) || _ownerOnly.ContainsKey(roomId);

    // Rooms seen only by one user (and server admins), set by their owner service rather
    // than stored here: the room of a game that is still a draft (see GameCatalog).
    private readonly Dictionary<string, uint> _ownerOnly = new();

    /// <summary>
    /// Makes the room private to <paramref name="ownerUserId"/> and server admins (or, with
    /// null, lifts that). Not stored: the owner service sets it again at startup. The caller
    /// evicts whoever may no longer see it.
    /// </summary>
    public void SetOwnerOnly(string roomId, uint? ownerUserId)
    {
        if (ownerUserId is { } owner)
            _ownerOnly[roomId] = owner;
        else
            _ownerOnly.Remove(roomId);
    }

    /// <summary>
    /// Whether the user may see (and enter) the channel: anyone for a public one; for a
    /// private one a server admin, an admin of the channel or a member given access —
    /// never an anonymous connection. A ban is checked separately (<see cref="IsBanned"/>).
    /// </summary>
    public bool CanSee(UserAccount? user, string roomId)
    {
        if (!IsPrivate(roomId))
            return true;
        if (user == null)
            return false;
        if (user.IsAdmin)
            return true;
        if (_ownerOnly.TryGetValue(roomId, out var owner))
            return user.Id == owner;
        return Member(roomId, user.Id) is { } m && (m.IsAdmin || m.HasAccess);
    }

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
        SaveChannel(roomId, channel);
    }

    /// <summary>Records a channel created by an admin (its room is created by the caller).</summary>
    public void CreateChannel(string roomId, string name, bool isPrivate, bool isVoice = false)
    {
        var channel = Get(roomId);
        channel.Name = name;
        channel.IsPrivate = isPrivate;
        channel.IsVoice = isVoice;
        channel.CreatedMs = NowMs();
        SaveChannel(roomId, channel);
    }

    /// <summary>Renames a created channel and / or makes it private or public.</summary>
    public void UpdateChannel(string roomId, string name, bool isPrivate)
    {
        var channel = Get(roomId);
        channel.Name = name;
        channel.IsPrivate = isPrivate;
        SaveChannel(roomId, channel);
    }

    /// <summary>Forgets a created channel with everyone's standing in it (and, in storage, its history).</summary>
    public void DeleteChannel(string roomId)
    {
        _channels.Remove(roomId);
        _storage.DeleteChannel(roomId);
    }

    /// <summary>Gives / takes away access to a (private) channel.</summary>
    public void SetAccess(string roomId, uint userId, bool hasAccess)
    {
        var member = GetMember(roomId, userId);
        member.HasAccess = hasAccess;
        Save(roomId, member);
    }

    private void SaveChannel(string roomId, Channel channel)
        => _storage.SaveChannel(new StoredChannel(roomId, channel.DefaultPermissions)
        {
            Name = channel.Name,
            IsPrivate = channel.IsPrivate,
            CreatedMs = channel.CreatedMs,
            IsVoice = channel.IsVoice,
        });

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

    // A member that is neither admin nor restricted nor given access is no longer worth a row.
    private void Save(string roomId, ChannelMember member)
    {
        if (!member.IsAdmin && !member.HasRestriction && !member.HasAccess)
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
            HasAccess = member.HasAccess,
        });
    }

    // ---- wire -------------------------------------------------------------------------

    public ChannelPermissionsInfo Describe(string roomId)
    {
        var info = new ChannelPermissionsInfo
        {
            RoomId = roomId, DefaultPermissions = DefaultPermissions(roomId), IsPrivate = IsPrivate(roomId),
        };
        if (!_channels.TryGetValue(roomId, out var channel))
            return info;

        var now = NowMs();
        foreach (var m in channel.Members.Values.OrderBy(m => m.UserId))
        {
            if (m.HasAccess)
                info.Members.Add(m.UserId);
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
