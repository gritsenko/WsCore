using Game.Protocol.ClientMessages;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class PlayerShootingClientMessageHandler() : MessageHandlerBase<PlayerShootingClientMessage>
{
    protected override void Handle(uint clientId, PlayerShootingClientMessage msg)
    {
        var player = Game.GetPlayer(clientId);
        var bulletIds = Game.SpawnBullet(player.Movement.Pos, player.Movement.AimPos, clientId);
        Messenger.Broadcast(new PlayerShootingServerMessage(clientId, msg.Weapon, bulletIds));
    }
}