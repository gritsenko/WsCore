using System.Linq;
using Game.Core.World;
using Game.ServerLogic;
using MemoryPack;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Events;

[GenerateTypeScript]
[MemoryPackable]
public partial class UpdateMapObjectsEvent : IServerEvent
{
    public static byte TypeId => 52;

    public MapObjectData[] MapObjects;

    [MemoryPackConstructor]
    public UpdateMapObjectsEvent()
    {
    }

    public UpdateMapObjectsEvent(GameObject[] objects)
    {
        MapObjects = objects.Select(x => new MapObjectData(x)).ToArray();
    }
}