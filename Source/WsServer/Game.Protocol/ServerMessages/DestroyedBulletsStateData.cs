using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

public struct DestroyedBulletsStateData(uint[] bulletIds) : IMessageData
{
    public uint[] BulletIds = bulletIds;
}