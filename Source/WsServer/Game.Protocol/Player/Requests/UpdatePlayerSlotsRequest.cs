using WsServer.Abstract;

namespace Game.Protocol.Player.Requests;

[ClientMessageType(ClientMessageType.UpdatePlayerSlots)]
public struct UpdatePlayerSlotsRequest : IClientRequest
{
    public int Body;
    public int Gun;
    public int Armor;
}