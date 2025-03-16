using WsServer.Abstract;

namespace Game.Protocol.Map.Requests;

[ClientMessageType(ClientMessageType.GetTiles)]
public struct GetTilesRequest : IClientRequest
{
    public int MapX;
    public int MapY;
}