using Game.Core.World;
using Game.ServerLogic;
using MemoryPack;

namespace Game.ServerLogic.Map.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class MapObjectData
{
    public uint ObjectId { get; set; }
    public float X { get; set; }
    public float Y { get; set; }
    public uint ObjectType { get; set; }

    [MemoryPackConstructor]
    public MapObjectData() { }

    public MapObjectData(GameObject obj)
    {
        ObjectId = (uint)obj.Id;
        X = obj.X;
        Y = obj.Y;
        ObjectType = (uint)obj.ObjectType.Id;
    }
}