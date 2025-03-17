using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class PlayerRespawnClientMessageHandler(GameModel gameModel) : MessageHandlerBase<PlayerRespawnRequest>
{
    protected override void Handle(uint clientId, PlayerRespawnRequest msg)
    {
        var respawnPlayer = gameModel.RespawnPlayer(msg.PlayerId);

        Messenger.Broadcast(new PlayerRespawnEvent(respawnPlayer));
    }
}