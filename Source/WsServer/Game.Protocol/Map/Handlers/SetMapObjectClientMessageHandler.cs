using Game.Protocol.Map.Requests;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.Map.Handlers;

public class SetMapObjectClientMessageHandler() : MessageHandlerBase<SetMapObjectRequest>
{
    protected override void Handle(uint clientId, SetMapObjectRequest msg)
    {
        var player = Game.GetPlayer(clientId);
        Game.World.SetMapObject(msg.MapX, msg.MapY, msg.ObjectType);
        Messenger.Broadcast(
            new MapObjectsServerMessage(Game.World.GetTileBlockObjects(0, 0).ToArray()));
    }
}