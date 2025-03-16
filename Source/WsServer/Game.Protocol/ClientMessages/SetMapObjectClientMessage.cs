using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.SetMapObject)]
public struct SetMapObjectClientMessage : IClientMessage
{
    public int MapX;
    public int MapY;
    public int ObjectType;
}