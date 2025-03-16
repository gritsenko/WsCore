using WsServer.Abstract;

namespace Game.Protocol.Map.Requests;

[ClientMessageType(ClientMessageType.SetMapObject)]
public struct SetMapObjectRequest : IClientRequest
{
    public int MapX;
    public int MapY;
    public int ObjectType;
}