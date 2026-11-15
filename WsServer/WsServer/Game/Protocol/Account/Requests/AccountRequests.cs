using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Account.Requests;

/// <summary>
/// Claims the connection's (guest) user: gives it a login and a password, so the same
/// account can be entered from another browser / device with <see cref="LoginRequest"/>.
/// Until then a user is only reachable through the random key in one browser's storage.
/// Answered with an <c>AccountResultEvent</c>.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class ClaimAccountRequest : IClientRequest
{
    public static byte TypeId => 112;

    public string Login = string.Empty;
    public string Password = string.Empty;
}

/// <summary>
/// Enters a claimed account from this device: on success <see cref="UserKey"/> (a fresh
/// random key the client made up) becomes one more key of the account — later connects
/// just identify with it — and the connection is bound to the account (a
/// <c>PresenceSnapshotEvent</c> follows the <c>AccountResultEvent</c>). Sent instead of
/// <c>IdentifyRequest</c>, or after it (the connection then leaves its guest user).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class LoginRequest : IClientRequest
{
    public static byte TypeId => 113;

    public string Login = string.Empty;
    public string Password = string.Empty;
    public string UserKey = string.Empty;
}

/// <summary>
/// Leaves a claimed account on this device: the key this connection identified with stops
/// working and the connection becomes anonymous. Other devices stay logged in.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class LogoutRequest : IClientRequest
{
    public static byte TypeId => 114;
}

/// <summary>Sets the user's "about me" text (shown to everyone in the member list).</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class UpdateProfileRequest : IClientRequest
{
    public static byte TypeId => 115;

    public string About = string.Empty;
}

/// <summary>
/// Sets the user's avatar: a small PNG / JPEG / WebP file (the client downsizes it before
/// sending); empty removes it. Others learn the new <c>AvatarVersion</c> through presence
/// and fetch the image over HTTP (<c>/avatars/{userId}</c>).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class SetAvatarRequest : IClientRequest
{
    public static byte TypeId => 116;

    public byte[] Image = [];
}
