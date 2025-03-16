using Game.Protocol.Map.Requests;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.Map.Handlers;

public class DestroyMapObjectClientMessageHandler() : MessageHandlerBase<DestroyMapObjectRequest>
{
    protected override void Handle(uint clientId, DestroyMapObjectRequest msg)
    {
        var player = Game.GetPlayer(clientId);
        Game.World.DestroyObjects(msg.MapX, msg.MapY);
        Messenger.Broadcast(
            new MapObjectsServerMessage(Game.World.GetTileBlockObjects(0, 0).ToArray()));
    }
}