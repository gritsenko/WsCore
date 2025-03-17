using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerSlotsClientMessageHandler(GameModel gameModel) : MessageHandlerBase<UpdatePlayerSlotsRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerSlotsRequest msg)
    {
        var player = gameModel.GetPlayer(clientId);

        player.BodyIndex = msg.Body;
        player.WeaponIndex = msg.Gun;
        player.ArmorIndex = msg.Armor;
        Messenger.Broadcast(new UpdatePlayerSlotsEvent(player.Id, player.BodyIndex, player.WeaponIndex, player.ArmorIndex));
    }
}