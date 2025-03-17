using Game.Core;
using Game.ServerLogic.Map.Events;
using Game.ServerLogic.Map.Requests;
using WsServer.Abstract;
using WsServer.Common;

namespace Game.ServerLogic.Map.Handlers;

public class GetMapObjectsClientMessageHandler(IGameMessenger messenger, GameModel gameModel) : MessageHandlerBase<GetMapObjectsRequest>
{
    protected override void Handle(uint clientId, GetMapObjectsRequest msg)
    {
        var objects = gameModel.World.GetTileBlockObjects(msg.MapX, msg.MapY).ToArray();
        messenger.Send(clientId, new UpdateMapObjectsEvent(objects));
    }
}