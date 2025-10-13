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
        var respawnPlayer = gameModel.RespawnPlayer(request.PlayerId);

        messenger.Broadcast(new PlayerRespawnEvent(respawnPlayer));
    }
}