using Game.Core;
using MemoryPack;

namespace Game.ServerLogic.GameState.Events.GameTickStateUpdateEventData;

[GenerateTypeScript]
[MemoryPackable]
public partial class HitPlayerStateData
{
    public uint PlayerId { get; set; }
    public uint HitterId { get; set; }
    public int NewHp { get; set; }

    [MemoryPackConstructor]
    public HitPlayerStateData() { }

    public HitPlayerStateData(HitInfo hitInfo)
    {
        PlayerId = hitInfo.PlayerId;
        HitterId = hitInfo.HitterId;
        NewHp = hitInfo.NewHp;
    }
}