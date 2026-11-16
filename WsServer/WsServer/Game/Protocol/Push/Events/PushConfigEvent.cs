using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Push.Events;

/// <summary>
/// Sent to a connection once it is identified (after the <c>PresenceSnapshotEvent</c>):
/// the server's VAPID public key, the <c>applicationServerKey</c> a browser push
/// subscription must be made with. Not sent when push is disabled on the server.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class PushConfigEvent : IServerEvent
{
    public static byte TypeId => 130;

    /// <summary>base64url of the 65-byte uncompressed P-256 point.</summary>
    public string PublicKey = string.Empty;
}
