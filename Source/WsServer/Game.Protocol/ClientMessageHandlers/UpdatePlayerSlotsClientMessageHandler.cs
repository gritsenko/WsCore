using Game.Protocol.ClientMessages;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.ClientMessageHandlers;

public class UpdatePlayerSlotsClientMessageHandler() : MessageHandlerBase<UpdatePlayerSlotsClientMessage>
{
    protected override void Handle(uint clientId, UpdatePlayerSlotsClientMessage msg)
    {
        var player = Game.GetPlayer(clientId);

        player.BodyIndex = msg.Body;
        player.WeaponIndex = msg.Gun;
        player.ArmorIndex = msg.Armor;
        Messenger.Broadcast(new UpdatePlayerSlotsServerMessage(player.Id, player.BodyIndex, player.WeaponIndex, player.ArmorIndex));
    }
}