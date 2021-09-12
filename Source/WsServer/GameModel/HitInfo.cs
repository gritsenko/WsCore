namespace GameModel
{
    public struct HitInfo
    {
        public uint PlayerId;
        public uint HitterId;
        public int NewHp;

        public HitInfo(uint playerId, byte newHp, uint hitterId)
        {
            PlayerId = playerId;
            NewHp = newHp;
            HitterId = hitterId;
        }
    }
}