using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Requests;

[GenerateTypeScript]
[MemoryPackable]
public partial class UpdatePlayerTargetRequest : IClientRequest
{
    public static byte TypeId => 106;

    public float AimX;
    public float AimY;
}