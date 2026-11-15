using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Presence.Requests;

/// <summary>
/// The client reports that its user went idle (no input for a while) or came back. Only
/// the client can tell — a user reading the lobby sends nothing to the server.
/// </summary>
[GenerateTypeScript]
[MemoryPackable]
public partial class SetAwayRequest : IClientRequest
{
    public static byte TypeId => 111;

    public bool Away;
}
