using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Account.Events;

/// <summary>Values of <see cref="AccountResultEvent.Action"/>.</summary>
public static class AccountAction
{
    public const byte Claim = 1;
    public const byte Login = 2;
    public const byte Logout = 3;
    public const byte Profile = 4;
    public const byte Avatar = 5;
}

/// <summary>Machine-readable values of <see cref="AccountResultEvent.Error"/>.</summary>
public static class AccountError
{
    public const string NotIdentified = "not_identified";
    public const string InvalidLogin = "invalid_login";
    public const string InvalidPassword = "invalid_password";
    public const string InvalidKey = "invalid_key";
    public const string LoginTaken = "login_taken";
    public const string AlreadyClaimed = "already_claimed";
    public const string NotClaimed = "not_claimed";
    public const string BadCredentials = "bad_credentials";
    public const string TooManyAttempts = "too_many_attempts";
    public const string Busy = "busy";
    public const string TooFast = "too_fast";
    public const string InvalidImage = "invalid_image";
}

/// <summary>
/// The answer to an account request (claim / login / logout / profile / avatar), sent to
/// the requester only. <see cref="Login"/> is the account's login after the operation
/// (null = the connection's user is an unclaimed guest, or there is none).
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class AccountResultEvent : IServerEvent
{
    public static byte TypeId => 112;

    // AccountAction: 1 claim, 2 login, 3 logout, 4 profile, 5 avatar.
    public byte Action;
    public bool Success;
    // AccountError code; null on success.
    public string? Error;
    public string? Login;
}
