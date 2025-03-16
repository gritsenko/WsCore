using WsServer.Abstract;

namespace Game.Protocol.Player.Requests;

[ClientMessageType(ClientMessageType.UpdatePlayerState)]
public struct UpdatePlayerStateRequest : IClientRequest
{
    public float AimX;
    public float AimY;
    public int ControlsState;
}