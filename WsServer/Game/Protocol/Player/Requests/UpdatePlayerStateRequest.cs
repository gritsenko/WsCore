using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Requests;

[GenerateTypeScript]
[MemoryPackable]
public partial class UpdatePlayerStateRequest : IClientRequest
{
    public static byte TypeId => 101;

    public float AimX;
    public float AimY;
    public int ControlsState;
}