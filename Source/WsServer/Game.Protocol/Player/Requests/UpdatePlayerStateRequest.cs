using WsServer.Abstract;

namespace Game.ServerLogic.Player.Requests;

public struct UpdatePlayerStateRequest : IClientRequest
{
    public static byte TypeId => 101;

    public float AimX;
    public float AimY;
    public int ControlsState;
}