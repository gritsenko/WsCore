using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerSlotsRequestHandler(GameModel gameModel, IGameMessenger messenger) : RequestHandlerBase<UpdatePlayerSlotsRequest>
{
    private const int MinSlot = 0;
    private const int MaxSlot = 4;

    protected override void Handle(uint clientId, UpdatePlayerSlotsRequest request)
    {
        var player = gameModel.GetPlayer(clientId);
        if (player == null) return;

        // Clamp to the valid slot range so out-of-range indices can't break rendering or
        // the ClassHp lookup (audit §2).
        player.BodyIndex = Math.Clamp(request.Body, MinSlot, MaxSlot);
        player.WeaponIndex = Math.Clamp(request.Gun, MinSlot, MaxSlot);
        player.ArmorIndex = Math.Clamp(request.Armor, MinSlot, MaxSlot);
        messenger.Broadcast(new UpdatePlayerSlotsEvent(player.Id, player.BodyIndex, player.WeaponIndex, player.ArmorIndex));
    }
}