using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Bullets.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class DestroyedBulletsStateData(uint[] bulletIds)
{
    public uint[] BulletIds = bulletIds;
}