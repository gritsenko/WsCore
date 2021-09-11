using WsServer.Abstract;

namespace WsServer.ServerMessages
{
    public struct DestroyedBulletsStateData : IMessageData
    {
        public uint[] BulletIds;

        public DestroyedBulletsStateData(uint[] bulletIds)
        {
            this.BulletIds = bulletIds;
        }
    }
}