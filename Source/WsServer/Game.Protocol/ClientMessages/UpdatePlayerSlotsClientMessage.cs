using WsServer.Abstract;

namespace Game.Protocol.ClientMessages;

[ClientMessageType(ClientMessageType.UpdatePlayerSlots)]
public struct UpdatePlayerSlotsClientMessage : IClientMessage
{
    public int Body;
    public int Gun;
    public int Armor;
}