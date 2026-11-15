using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Presence.Requests;

/// <summary>
/// Binds the connection to a stable user. Client ids change on every (re)connect; the
/// user key — a random secret the client keeps in its local storage — is what makes
/// someone the same user across reconnects and visits (and several tabs). The key is
/// never sent to other clients: they only ever see the public <c>UserId</c>.
/// Answered with a <c>PresenceSnapshotEvent</c>. Also sets the display name.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class IdentifyRequest : IClientRequest
{
    public static byte TypeId => 110;

    public string UserKey = string.Empty;
    public string Name = string.Empty;
}
