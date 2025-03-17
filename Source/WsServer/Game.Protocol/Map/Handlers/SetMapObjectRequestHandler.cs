using Game.Core;
using Game.ServerLogic.Map.Events;
using Game.ServerLogic.Map.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Handlers;

public class SetMapObjectRequestHandler(IGameMessenger messenger, GameModel gameModel) : RequestHandlerBase<SetMapObjectRequest>
{
    protected override void Handle(uint clientId, SetMapObjectRequest request)
    {
        var player = gameModel.GetPlayer(clientId);
        gameModel.World.SetMapObject(request.MapX, request.MapY, request.ObjectType);
        var data = gameModel.World.GetTileBlockObjects(0, 0).ToArray();
        messenger.Broadcast(new UpdateMapObjectsEvent(data));
    }
}