using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.UpdatePlayerTarget)]
public struct UpdatePlayerTargetClientMessage : IClientMessage
{
    public float AimX;
    public float AimY;
}