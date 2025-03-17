using Game.Core;
using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerTargetClientMessageHandler(GameModel gameModel) : MessageHandlerBase<UpdatePlayerTargetRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerTargetRequest msg)
    {
        var p = gameModel.SetPlayerTarget(clientId, msg.AimX, msg.AimY);
    }
}