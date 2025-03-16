using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.Map.Events;

public struct MapObjectsServerMessage : IServerMessage
{
    public static byte TypeId => 52;

    public MapObjectData[] MapObjects;

    public MapObjectsServerMessage(GameObject[] objects)
    {
        MapObjects = objects.Select(x => new MapObjectData(x)).ToArray();
    }
}