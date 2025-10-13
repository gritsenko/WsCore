using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Requests;

[GenerateTypeScript]
[MemoryPackable]
public partial class DestroyMapObjectRequest : IClientRequest
{
    public static byte TypeId => 53;

    public int MapX;
    public int MapY;
}