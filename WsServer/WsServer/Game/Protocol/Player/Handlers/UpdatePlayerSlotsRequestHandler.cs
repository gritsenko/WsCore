using Game.Core;
using Game.ServerLogic.Player.Events;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract;
using WsServer.Abstract.Messages;
using WsServer.Sessions;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerSlotsRequestHandler(GameModel gameModel, SessionManager sessions, IGameMessenger messenger) : RequestHandlerBase<UpdatePlayerSlotsRequest>
{
    private const int MinSlot = 0;
    private const int MaxSlot = 4;

    protected override void Handle(uint clientId, UpdatePlayerSlotsRequest request)
    {
        var session = sessions.Get(clientId);
        if (session == null) return;

        // Clamp to the valid slot range so out-of-range indices can't break rendering or
        // the ClassHp lookup (audit §2).
        var body = Math.Clamp(request.Body, MinSlot, MaxSlot);
        var gun = Math.Clamp(request.Gun, MinSlot, MaxSlot);
        var armor = Math.Clamp(request.Armor, MinSlot, MaxSlot);

        // Remembered on the session (clients pick slots in the lobby, before they have an
        // avatar) and applied when the avatar is spawned.
        session.BodyIndex = body;
        session.WeaponIndex = gun;
        session.ArmorIndex = armor;

        var player = gameModel.GetPlayer(clientId);
        if (player == null) return;

        player.BodyIndex = body;
        player.WeaponIndex = gun;
        player.ArmorIndex = armor;
        messenger.BroadcastToSpatial(new UpdatePlayerSlotsEvent(player.Id, player.BodyIndex, player.WeaponIndex, player.ArmorIndex));
    }
}
