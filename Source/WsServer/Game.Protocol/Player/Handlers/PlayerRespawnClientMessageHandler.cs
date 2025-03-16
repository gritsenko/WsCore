using Game.Protocol.Player.Requests;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.Player.Handlers;

public class PlayerRespawnClientMessageHandler() : MessageHandlerBase<PlayerRespawnRequest>
{
    protected override void Handle(uint clientId, PlayerRespawnRequest msg)
    {
        var respawnPlayer = Game.RespawnPlayer(msg.PlayerId);

        Messenger.Broadcast(new PlayerRespawnServerMessage(respawnPlayer));
    }
}