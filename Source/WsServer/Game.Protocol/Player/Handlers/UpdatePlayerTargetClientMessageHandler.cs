using Game.ServerLogic.Player.Requests;
using WsServer.Common;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerTargetClientMessageHandler() : MessageHandlerBase<UpdatePlayerTargetRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerTargetRequest msg)
    {
        var p = Game.SetPlayerTarget(clientId, msg.AimX, msg.AimY);
    }
}