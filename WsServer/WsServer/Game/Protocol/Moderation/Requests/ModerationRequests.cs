using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Moderation.Requests;

/// <summary>
/// Promotes a user to admin of a channel, changes their rights / title, or (Rights = 0)
/// demotes them. Needs the AddAdmins right; one can grant only rights one has. Answered
/// with a <c>ModerationResultEvent</c>; everyone learns the change from a
/// <c>ChannelPermissionsEvent</c>.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class SetChannelAdminRequest : IClientRequest
{
    public static byte TypeId => 120;

    public string RoomId = string.Empty;
    public uint UserId;
    public byte Rights;
    public string Title = string.Empty;
}

/// <summary>
/// Restricts a member of a channel: takes permissions away (Denied) and / or bans them
/// (cannot enter the channel), for DurationSeconds (0 = forever). Denied = 0 and
/// Banned = false lifts the restriction. Needs the RestrictMembers right.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class SetChannelRestrictionRequest : IClientRequest
{
    public static byte TypeId => 121;

    public string RoomId = string.Empty;
    public uint UserId;
    public byte Denied;
    public bool Banned;
    public uint DurationSeconds;
}

/// <summary>Sets what every member of a channel may do. Needs the RestrictMembers right.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class SetChannelDefaultsRequest : IClientRequest
{
    public static byte TypeId => 122;

    public string RoomId = string.Empty;
    public byte DefaultPermissions;
}

/// <summary>Makes a (claimed) user a server admin, or not. Server admins only.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class SetServerAdminRequest : IClientRequest
{
    public static byte TypeId => 123;

    public uint UserId;
    public bool IsAdmin;
}
