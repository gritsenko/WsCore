using Game.Model;
using WsServer.Abstract;

namespace Game.Protocol.ServerMessages;

[ServerMessageType(ServerMessageType.MapObjects)]
public struct MapObjectsServerMessage : IServerMessage
{
    public MapObjectData[] MapObjects;

    public MapObjectsServerMessage(GameObject[] objects)
    {
        MapObjects = objects.Select(x => new MapObjectData(x)).ToArray();
    }
}