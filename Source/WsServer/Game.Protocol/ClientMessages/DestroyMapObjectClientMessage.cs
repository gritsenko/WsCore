using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.DestroyMapObject)]
public struct DestroyMapObjectClientMessage : IClientMessage
{
    public int MapX;
    public int MapY;
}