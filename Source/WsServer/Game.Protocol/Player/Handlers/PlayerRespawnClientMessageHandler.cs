using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class PlayerRespawnClientMessageHandler() : MessageHandlerBase<PlayerRespawnRequest>
{
    protected override void Handle(uint clientId, PlayerRespawnRequest msg)
    {
        var respawnPlayer = Game.RespawnPlayer(msg.PlayerId);

        Messenger.Broadcast(new PlayerRespawnServerMessage(respawnPlayer));
    }
}