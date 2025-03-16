using Game.Protocol.Map.Requests;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.Map.Handlers;

public class GetMapObjectsClientMessageHandler : MessageHandlerBase<GetMapObjectsRequest>
{
    protected override void Handle(uint clientId, GetMapObjectsRequest msg)
    {
        var objects = Game.World.GetTileBlockObjects(msg.MapX, msg.MapY).ToArray();
        var mapObjectsMessage = new MapObjectsServerMessage(objects);

        Messenger.SendMessage(clientId, mapObjectsMessage);
    }
}