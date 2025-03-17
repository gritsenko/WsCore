using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Requests;

public struct GetMapObjectsRequest : IClientRequest
{
    public static byte TypeId => 51;

    public int MapX;
    public int MapY;
}