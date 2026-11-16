using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Moderation.Events;

/// <summary>
/// What a channel admin may do in that channel (Telegram-style admin rights), as bit
/// flags of <see cref="ChannelAdminInfo.Rights"/>. A server admin has all of them in every
/// channel.
/// </summary>
public static class ChannelRights
{
    public const byte DeleteMessages = 1;
    // Mute / ban members and change the channel's default member permissions.
    public const byte RestrictMembers = 2;
    // Promote / demote channel admins (never with more rights than one's own).
    public const byte AddAdmins = 4;
    public const byte All = DeleteMessages | RestrictMembers | AddAdmins;
}

/// <summary>
/// What a member may do in a channel, as bit flags: the channel's defaults, minus what a
/// restriction denies a particular user. Admins are never restricted.
/// </summary>
public static class MemberPermissions
{
    public const byte SendMessages = 1;
    public const byte SendLinks = 2;
    public const byte All = SendMessages | SendLinks;
}

/// <summary>Values of <see cref="ModerationResultEvent.Action"/>.</summary>
public static class ModerationAction
{
    public const byte SetAdmin = 1;
    public const byte Restrict = 2;
    public const byte SetDefaults = 3;
    public const byte SetServerAdmin = 4;
    public const byte DeleteMessage = 5;
    // A chat message was refused (muted, banned, links not allowed).
    public const byte SendMessage = 6;
}

/// <summary>Machine-readable values of <see cref="ModerationResultEvent.Error"/>.</summary>
public static class ModerationError
{
    public const string NotIdentified = "not_identified";
    public const string NoChannel = "no_channel";
    public const string NoUser = "no_user";
    public const string NoMessage = "no_message";
    public const string Forbidden = "forbidden";
    // Admin roles need a claimed account (a guest is one browser's key, not a person).
    public const string NotClaimed = "not_claimed";
    // Admins cannot be restricted — demote them first.
    public const string TargetIsAdmin = "target_is_admin";
    public const string Self = "self";
    // The home room (where every connection lands) cannot ban anyone.
    public const string HomeRoom = "home_room";
    // A server admin listed in the configuration (AdminLogins) cannot be demoted.
    public const string Configured = "configured";
    public const string Muted = "muted";
    public const string Banned = "banned";
    public const string LinksForbidden = "links_forbidden";
    public const string TooFast = "too_fast";
}

/// <summary>A channel admin: their rights and an optional title shown next to their name.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ChannelAdminInfo
{
    public uint UserId;
    // ChannelRights flags.
    public byte Rights;
    // Custom title ("модератор"); empty = the default label.
    public string Title = string.Empty;
}

/// <summary>A restricted member of a channel.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ChannelRestrictionInfo
{
    public uint UserId;
    // MemberPermissions flags taken away from the user.
    public byte Denied;
    // Banned: cannot enter the channel at all.
    public bool Banned;
    // Unix ms when the restriction ends; 0 = forever.
    public double UntilMs;
}

/// <summary>One channel's (room's) permissions: defaults, admins, restrictions.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ChannelPermissionsInfo
{
    public string RoomId = string.Empty;
    // MemberPermissions every member has unless restricted.
    public byte DefaultPermissions = MemberPermissions.All;

    [MemoryPackAllowSerialize]
    public List<ChannelAdminInfo> Admins = new();

    // Active restrictions only (expired ones are left out).
    [MemoryPackAllowSerialize]
    public List<ChannelRestrictionInfo> Restrictions = new();
}

/// <summary>
/// Channel permissions. <see cref="Reset"/> = true: every channel (sent after the
/// identify); otherwise only the channels that changed (sent to every identified
/// connection).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ChannelPermissionsEvent : IServerEvent
{
    public static byte TypeId => 120;

    public bool Reset;

    [MemoryPackAllowSerialize]
    public List<ChannelPermissionsInfo> Channels = new();
}

/// <summary>The answer to a moderation request (or a refused chat message), to the requester only.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ModerationResultEvent : IServerEvent
{
    public static byte TypeId => 121;

    // ModerationAction.
    public byte Action;
    public bool Success;
    // ModerationError code; null on success.
    public string? Error;
}
