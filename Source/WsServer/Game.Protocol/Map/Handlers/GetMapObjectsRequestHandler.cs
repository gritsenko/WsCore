using Game.Core;
using Game.ServerLogic.Map.Events;
using Game.ServerLogic.Map.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Map.Handlers;

public class GetMapObjectsRequestHandler(IGameMessenger messenger, GameModel gameModel) : RequestHandlerBase<GetMapObjectsRequest>
{
    protected override void Handle(uint clientId, GetMapObjectsRequest request)
    {
        var objects = gameModel.World.GetTileBlockObjects(request.MapX, request.MapY).ToArray();
        messenger.Send(clientId, new UpdateMapObjectsEvent(objects));
    }
}