using WsServer.Abstract;

namespace Game.ServerLogic.Map.Requests;

public struct GetTilesRequest : IClientRequest
{
    public static byte TypeId => 50;

    public int MapX;
    public int MapY;
}