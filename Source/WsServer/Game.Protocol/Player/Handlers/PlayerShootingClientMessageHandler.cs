using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class PlayerShootingClientMessageHandler() : MessageHandlerBase<PlayerShootingRequest>
{
    protected override void Handle(uint clientId, PlayerShootingRequest msg)
    {
        var player = Game.GetPlayer(clientId);
        var bulletIds = Game.SpawnBullet(player.Movement.Pos, player.Movement.AimPos, clientId);
        Messenger.Broadcast(new PlayerShootingServerMessage(clientId, msg.Weapon, bulletIds));
    }
}