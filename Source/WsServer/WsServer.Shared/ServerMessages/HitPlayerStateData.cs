using GameModel;
using WsServer.Abstract;

namespace WsServer.ServerMessages
{
    public struct HitPlayerStateData : IMessageData
    {
        public uint PlayerId;
        public uint HitterId;
        public int NewHp;

        public HitPlayerStateData(HitInfo hitInfo)
        {
            PlayerId = hitInfo.PlayerId;
            HitterId = hitInfo.HitterId;
            NewHp = hitInfo.NewHp;
        }
    }
}