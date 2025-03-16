using Game.Protocol.ClientMessages;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class PlayerRespawnClientMessageHandler() : MessageHandlerBase<PlayerRespawnClientMessage>
{
    protected override void Handle(uint clientId, PlayerRespawnClientMessage msg)
    {
        var respawnPlayer = Game.RespawnPlayer(msg.PlayerId);

        Messenger.Broadcast(new PlayerRespawnServerMessage(respawnPlayer));
    }
}