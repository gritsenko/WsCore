using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerSlotsRequestHandler(GameModel gameModel, IGameMessenger messenger) : RequestHandlerBase<UpdatePlayerSlotsRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerSlotsRequest request)
    {
        var player = gameModel.GetPlayer(clientId);

        player.BodyIndex = request.Body;
        player.WeaponIndex = request.Gun;
        player.ArmorIndex = request.Armor;
        messenger.Broadcast(new UpdatePlayerSlotsEvent(player.Id, player.BodyIndex, player.WeaponIndex, player.ArmorIndex));
    }
}