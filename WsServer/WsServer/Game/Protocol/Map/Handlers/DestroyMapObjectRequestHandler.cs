using System.Linq;
using Game.Core;
using Game.ServerLogic.Map.Events;
using Game.ServerLogic.Map.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Handlers;

public class DestroyMapObjectRequestHandler(GameModel gameModel, IGameMessenger messenger) : RequestHandlerBase<DestroyMapObjectRequest>
{
    protected override void Handle(uint clientId, DestroyMapObjectRequest request)
    {
        // Only clients with an avatar (i.e. in the game world) may edit the map.
        if (gameModel.GetPlayer(clientId) == null)
            return;
        gameModel.World.DestroyObjects(request.MapX, request.MapY);
        messenger.BroadcastToSpatial(new UpdateMapObjectsEvent(gameModel.World.GetTileBlockObjects(0, 0).ToArray()));
    }
}
