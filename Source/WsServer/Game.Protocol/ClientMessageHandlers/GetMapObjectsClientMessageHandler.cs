using Game.Protocol.ClientMessages;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class GetMapObjectsClientMessageHandler : MessageHandlerBase<GetMapObjectsClientMessage>
{
    protected override void Handle(uint clientId, GetMapObjectsClientMessage msg)
    {
        var objects = Game.World.GetTileBlockObjects(msg.MapX, msg.MapY).ToArray();
        var mapObjectsMessage = new MapObjectsServerMessage(objects);

        Messenger.SendMessage(clientId, mapObjectsMessage);
    }
}