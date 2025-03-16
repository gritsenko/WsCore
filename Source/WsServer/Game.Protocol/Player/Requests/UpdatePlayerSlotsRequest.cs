using WsServer.Abstract;

namespace Game.ServerLogic.Player.Requests;
public struct UpdatePlayerSlotsRequest : IClientRequest
{
    public static byte TypeId => 102;

    public int Body;
    public int Gun;
    public int Armor;
}