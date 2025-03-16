using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.GetMapObjects)]
public struct GetMapObjectsClientMessage : IClientMessage
{
    public int MapX;
    public int MapY;
}