using System.Linq;
using GameModel;
using WsServer.Abstract;
using WsServer.Common;

namespace WsServer.ServerMessages
{
    [ServerMessageType(ServerMessageType.MapObjects)]
    public struct MapObjectsServerMessage : IServerMessage
    {
        public MapObjectData[] MapObjects;

        public MapObjectsServerMessage(GameObject[] objects)
        {
            MapObjects = objects.Select(x => new MapObjectData(x)).ToArray();
        }
    }
}