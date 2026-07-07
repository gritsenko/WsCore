using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class PlayerRespawnRequestHandler(GameModel gameModel, IGameMessenger messenger) : RequestHandlerBase<PlayerRespawnRequest>
{
    protected override void Handle(uint clientId, PlayerRespawnRequest request)
    {
        // Respawn only the authenticated caller, never the client-supplied PlayerId, so a
        // client can't respawn other players. RespawnPlayer may return null (audit §1.10).
        var respawnPlayer = gameModel.RespawnPlayer(clientId);
        if (respawnPlayer == null)
            return;

        messenger.Broadcast(new PlayerRespawnEvent(respawnPlayer));
    }
}