using Game.Core;
using Game.ServerLogic.Map.Events;
using Game.ServerLogic.Map.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Map.Handlers;

public class DestroyMapObjectClientMessageHandler(GameModel gameModel) : MessageHandlerBase<DestroyMapObjectRequest>
{
    protected override void Handle(uint clientId, DestroyMapObjectRequest msg)
    {
        var player = gameModel.GetPlayer(clientId);
        gameModel.World.DestroyObjects(msg.MapX, msg.MapY);
        Messenger.Broadcast(
            new UpdateMapObjectsEvent(gameModel.World.GetTileBlockObjects(0, 0).ToArray()));
    }
}