using Game.Protocol.Player.Requests;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.Player.Handlers;

public class PlayerShootingClientMessageHandler() : MessageHandlerBase<PlayerShootingRequest>
{
    protected override void Handle(uint clientId, PlayerShootingRequest msg)
    {
        var player = Game.GetPlayer(clientId);
        var bulletIds = Game.SpawnBullet(player.Movement.Pos, player.Movement.AimPos, clientId);
        Messenger.Broadcast(new PlayerShootingServerMessage(clientId, msg.Weapon, bulletIds));
    }
}