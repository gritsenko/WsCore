using WsServer.Abstract;

namespace Game.Protocol.Map.Requests;

[ClientMessageType(ClientMessageType.GetMapObjects)]
public struct GetMapObjectsRequest : IClientRequest
{
    public int MapX;
    public int MapY;
}