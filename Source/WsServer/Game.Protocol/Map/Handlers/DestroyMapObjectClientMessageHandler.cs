using Game.ServerLogic.Map.Events;
using Game.ServerLogic.Map.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Map.Handlers;

public class DestroyMapObjectClientMessageHandler() : MessageHandlerBase<DestroyMapObjectRequest>
{
    protected override void Handle(uint clientId, DestroyMapObjectRequest msg)
    {
        var player = Game.GetPlayer(clientId);
        Game.World.DestroyObjects(msg.MapX, msg.MapY);
        Messenger.Broadcast(
            new UpdateMapObjectsEvent(Game.World.GetTileBlockObjects(0, 0).ToArray()));
    }
}