using Game.Protocol.ClientMessages;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class DestroyMapObjectClientMessageHandler() : MessageHandlerBase<DestroyMapObjectClientMessage>
{
    protected override void Handle(uint clientId, DestroyMapObjectClientMessage msg)
    {
        var player = Game.GetPlayer(clientId);
        Game.World.DestroyObjects(msg.MapX, msg.MapY);
        Messenger.Broadcast(
            new MapObjectsServerMessage(Game.World.GetTileBlockObjects(0, 0).ToArray()));
    }
}