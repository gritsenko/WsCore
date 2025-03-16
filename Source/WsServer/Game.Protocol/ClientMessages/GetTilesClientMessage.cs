using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.GetTiles)]
public struct GetTilesClientMessage : IClientMessage
{
    public int MapX;
    public int MapY;
}