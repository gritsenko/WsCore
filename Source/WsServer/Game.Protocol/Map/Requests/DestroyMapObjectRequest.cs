using WsServer.Abstract;

namespace Game.ServerLogic.Map.Requests;

public struct DestroyMapObjectRequest : IClientRequest
{
    public static byte TypeId => 53;

    public int MapX;
    public int MapY;
}