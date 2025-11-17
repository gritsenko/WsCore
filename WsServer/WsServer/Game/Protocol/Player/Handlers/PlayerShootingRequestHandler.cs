using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class PlayerShootingRequestHandler(GameModel gameModel, IGameMessenger messenger) : RequestHandlerBase<PlayerShootingRequest>
{
    protected override void Handle(uint clientId, PlayerShootingRequest request)
    {
        var player = gameModel.GetPlayer(clientId);
        var bulletIds = gameModel.SpawnBullet(player.MovementState.Pos, player.MovementState.AimPos, clientId);
        messenger.Broadcast(new PlayerShootingEvent(clientId, request.Weapon, bulletIds));
    }
}