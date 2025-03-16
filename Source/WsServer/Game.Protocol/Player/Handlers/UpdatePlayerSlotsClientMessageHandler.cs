using Game.Protocol.Player.Requests;
using Game.Protocol.ServerMessages;
using WsServer.Common;

namespace Game.Protocol.Player.Handlers;

public class UpdatePlayerSlotsClientMessageHandler() : MessageHandlerBase<UpdatePlayerSlotsRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerSlotsRequest msg)
    {
        var player = Game.GetPlayer(clientId);

        player.BodyIndex = msg.Body;
        player.WeaponIndex = msg.Gun;
        player.ArmorIndex = msg.Armor;
        Messenger.Broadcast(new UpdatePlayerSlotsServerMessage(player.Id, player.BodyIndex, player.WeaponIndex, player.ArmorIndex));
    }
}