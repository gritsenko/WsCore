using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Requests;

[GenerateTypeScript]
[MemoryPackable]
public partial class SetPlayerNameRequest : IClientRequest
{
    public static byte TypeId => 100;

    // Length is enforced server-side in the handler; MemoryPack ignores [MarshalAs].
    public string Name;
}