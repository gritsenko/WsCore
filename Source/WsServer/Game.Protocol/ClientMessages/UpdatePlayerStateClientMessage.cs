using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.UpdatePlayerState)]
public struct UpdatePlayerStateClientMessage : IClientMessage
{
    public float AimX;
    public float AimY;
    public int ControlsState;
}