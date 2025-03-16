using Game.Core;
using Game.ServerLogic.Map.Events;
using Game.ServerLogic.Map.Requests;
using WsServer.Abstract;
using WsServer.Common;

namespace Game.ServerLogic.Map.Handlers;

public class SetMapObjectClientMessageHandler(IGameMessenger messenger, GameModel gameModel) : MessageHandlerBase<SetMapObjectRequest>
{
    protected override void Handle(uint clientId, SetMapObjectRequest msg)
    {
        var player = gameModel.GetPlayer(clientId);
        gameModel.World.SetMapObject(msg.MapX, msg.MapY, msg.ObjectType);
        var data = gameModel.World.GetTileBlockObjects(0, 0).ToArray();
        messenger.Broadcast(new UpdateMapObjectsEvent(data));
    }
}