using Game.Core.World;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Events;

public struct UpdateMapObjectsEvent : IServerEvent
{
    public static byte TypeId => 52;

    public MapObjectData[] MapObjects;

    public UpdateMapObjectsEvent(GameObject[] objects)
    {
        MapObjects = objects.Select(x => new MapObjectData(x)).ToArray();
    }
}