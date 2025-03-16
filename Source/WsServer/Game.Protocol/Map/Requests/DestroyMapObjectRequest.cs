using WsServer.Abstract;

namespace Game.Protocol.Map.Requests;

[ClientMessageType(ClientMessageType.DestroyMapObject)]
public struct DestroyMapObjectRequest : IClientRequest
{
    public int MapX;
    public int MapY;
}