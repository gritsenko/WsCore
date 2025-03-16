using WsServer.Abstract;

namespace Game.ServerLogic.Player.Requests;

public struct UpdatePlayerTargetRequest : IClientRequest
{
    public static byte TypeId => 106;

    public float AimX;
    public float AimY;
}