using Game.Protocol.ClientMessages;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class SetMapObjectClientMessageHandler() : MessageHandlerBase<SetMapObjectClientMessage>
{
    protected override void Handle(uint clientId, SetMapObjectClientMessage msg)
    {
        var player = Game.GetPlayer(clientId);
        Game.World.SetMapObject(msg.MapX, msg.MapY, msg.ObjectType);
        Messenger.Broadcast(
            new MapObjectsServerMessage(Game.World.GetTileBlockObjects(0, 0).ToArray()));
    }
}