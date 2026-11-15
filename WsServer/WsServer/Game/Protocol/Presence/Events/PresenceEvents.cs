using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Presence.Events;

/// <summary>Presence of a known user. Values of <see cref="PresenceUserInfo.Status"/>.</summary>
public static class PresenceStatus
{
    public const byte Offline = 0;
    public const byte Online = 1;
    public const byte Away = 2;
}

/// <summary>One user of the member list: who, where, and whether they are around.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class PresenceUserInfo
{
    public uint UserId;
    public string Name = string.Empty;
    // PresenceStatus: 0 offline, 1 online, 2 away (afk).
    public byte Status;
    // The room the user is in; null while offline.
    public string? RoomId;
    // Unix ms the user was last connected (for offline users: when they left).
    public double LastSeenMs;
    // "About me" text; empty if not set.
    public string About = string.Empty;
    // 0 = no avatar; otherwise the image is at /avatars/{UserId}?v={AvatarVersion}.
    public uint AvatarVersion;
}

/// <summary>
/// The answer to <c>IdentifyRequest</c>: the client's own user id and the member list —
/// everyone online plus the most recently seen offline users. Kept current afterwards by
/// <see cref="PresenceUpdateEvent"/>s.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class PresenceSnapshotEvent : IServerEvent
{
    public static byte TypeId => 110;

    public uint YourUserId;

    [MemoryPackAllowSerialize]
    public List<PresenceUserInfo> Users = new();

    // The login of your account if it is claimed; null for a guest (see ClaimAccountRequest).
    public string? YourLogin;
}

/// <summary>
/// One user's presence changed (came online, went away / offline, moved to another room,
/// was renamed). Sent to every identified connection.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class PresenceUpdateEvent : IServerEvent
{
    public static byte TypeId => 111;

    public PresenceUserInfo User = new();
}
