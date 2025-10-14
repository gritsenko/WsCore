using MemoryPack;

namespace Game.ServerLogic.Bullets.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class DestroyedBulletsStateData(uint[] bulletIds)
{
    public uint[] BulletIds = bulletIds;
}