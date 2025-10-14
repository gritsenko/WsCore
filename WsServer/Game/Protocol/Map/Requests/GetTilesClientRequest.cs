using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Requests;

[GenerateTypeScript]
[MemoryPackable]
public partial class GetTilesRequest : IClientRequest
{
    public static byte TypeId => 50;

    public int MapX;
    public int MapY;
}