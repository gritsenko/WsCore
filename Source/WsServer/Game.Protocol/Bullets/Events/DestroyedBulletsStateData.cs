using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Bullets.Events;

public struct DestroyedBulletsStateData(uint[] bulletIds) : IMessageData
{
    public uint[] BulletIds = bulletIds;
}