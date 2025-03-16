using WsServer.Abstract;

namespace Game.Protocol.Player.Events;

public struct UpdatePlayerSlotsServerMessage(uint playerId, int bodyIndex, int weaponIndex, int armorIndex) : IServerMessage
{
    public static byte TypeId => 102;

    public uint PlayerId = playerId;
    public int Body = bodyIndex;
    public int Gun = weaponIndex;
    public int Armor = armorIndex;
}