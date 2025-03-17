using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Events;

public struct UpdatePlayerSlotsEvent(uint playerId, int bodyIndex, int weaponIndex, int armorIndex) : IServerEvent
{
    public static byte TypeId => 102;

    public uint PlayerId = playerId;
    public int Body = bodyIndex;
    public int Gun = weaponIndex;
    public int Armor = armorIndex;
}