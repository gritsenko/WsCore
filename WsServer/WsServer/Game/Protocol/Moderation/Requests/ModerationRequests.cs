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

/// <summary>
/// Creates a channel (a text-chat room). Server admins only. Answered with a
/// <c>ModerationResultEvent</c> carrying the new channel's id; the room appears in the
/// room lists of everyone who may see it.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class CreateChannelRequest : IClientRequest
{
    public static byte TypeId => 124;

    public string Name = string.Empty;
    // Private: seen and entered only by admins and the members given access.
    public bool IsPrivate;
    // A voice channel: members may join its voice (besides its text chat).
    public bool IsVoice;
}

/// <summary>Renames a created channel and / or makes it private / public. Server admins only.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class UpdateChannelRequest : IClientRequest
{
    public static byte TypeId => 125;

    public string RoomId = string.Empty;
    public string Name = string.Empty;
    public bool IsPrivate;
}

/// <summary>
/// Deletes a created channel with its history; whoever is inside goes back to the home
/// room. Server admins only.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class DeleteChannelRequest : IClientRequest
{
    public static byte TypeId => 126;

    public string RoomId = string.Empty;
}

/// <summary>
/// Gives (HasAccess = true) or takes away access to a private channel. Needs the
/// InviteUsers right; whoever loses access while inside goes back to the home room.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class SetChannelAccessRequest : IClientRequest
{
    public static byte TypeId => 127;

    public string RoomId = string.Empty;
    public uint UserId;
    public bool HasAccess;
}
