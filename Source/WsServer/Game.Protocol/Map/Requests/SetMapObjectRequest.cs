using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Requests;

public struct SetMapObjectRequest : IClientRequest
{
    public static byte TypeId => 52;

    public int MapX;
    public int MapY;
    public int ObjectType;
}