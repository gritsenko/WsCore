using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Push.Requests;

/// <summary>
/// Registers this device's Web Push subscription (what <c>PushManager.subscribe</c>
/// returned, made with the server's key from <c>PushConfigEvent</c>) for the connection's
/// user, so the server can notify them about chat messages while they are offline or
/// away. Sent again on every connect (idempotent): that also re-binds the subscription
/// when the device now belongs to another user (a login). No answer.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class PushSubscribeRequest : IClientRequest
{
    public static byte TypeId => 130;

    /// <summary>The push service URL (https).</summary>
    public string Endpoint = string.Empty;
    /// <summary>The subscription's P-256 public key, base64url (65-byte uncompressed point).</summary>
    public string P256dh = string.Empty;
    /// <summary>The subscription's 16-byte auth secret, base64url.</summary>
    public string Auth = string.Empty;
}

/// <summary>Forgets a subscription of the connection's user (notifications turned off). No answer.</summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class PushUnsubscribeRequest : IClientRequest
{
    public static byte TypeId => 131;

    public string Endpoint = string.Empty;
}
