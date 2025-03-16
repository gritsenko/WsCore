using WsServer.Abstract;

namespace Game.Protocol.Player.Requests;

[ClientMessageType(ClientMessageType.UpdatePlayerTarget)]
public struct UpdatePlayerTargetRequest : IClientRequest
{
    public float AimX;
    public float AimY;
}