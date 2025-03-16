using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

public struct UpdatePlayerSlotsServerMessage(uint playerId, int bodyIndex, int weaponIndex, int armorIndex) : IServerMessage
{
    public uint PlayerId = playerId;
    public int Body = bodyIndex;
    public int Gun = weaponIndex;
    public int Armor = armorIndex;
}