using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class PlayerShootingClientMessageHandler(GameModel gameModel) : MessageHandlerBase<PlayerShootingRequest>
{
    protected override void Handle(uint clientId, PlayerShootingRequest msg)
    {
        var player = gameModel.GetPlayer(clientId);
        var bulletIds = gameModel.SpawnBullet(player.MovementState.Pos, player.MovementState.AimPos, clientId);
        Messenger.Broadcast(new PlayerShootingEvent(clientId, msg.Weapon, bulletIds));
    }
}