using WsServer.Abstract;

namespace Game.Protocol.Bullets.Events;

public struct DestroyedBulletsStateData(uint[] bulletIds) : IMessageData
{
    public uint[] BulletIds = bulletIds;
}