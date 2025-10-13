using WsServer.Abstract.Messages;
using WsServer.DataBuffer.Abstract;

namespace Game.ServerLogic.Bullets.Events;

public struct DestroyedBulletsStateData(uint[] bulletIds) : IBufferSerializableData
{
    public uint[] BulletIds = bulletIds;
}