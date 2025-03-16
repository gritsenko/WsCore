namespace Game.Core;

public struct HitInfo(uint playerId, byte newHp, uint hitterId)
{
    public uint PlayerId = playerId;
    public uint HitterId = hitterId;
    public int NewHp = newHp;
}