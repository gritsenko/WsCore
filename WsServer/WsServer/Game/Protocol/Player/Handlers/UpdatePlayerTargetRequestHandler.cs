using Game.Core;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerTargetRequestHandler(GameModel gameModel) : RequestHandlerBase<UpdatePlayerTargetRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerTargetRequest request)
    {
        // Reject NaN/Inf so Vector2.Normalize can't spread NaN across the physics (audit §2).
        if (!float.IsFinite(request.AimX) || !float.IsFinite(request.AimY))
            return;

        gameModel.SetPlayerTarget(clientId, request.AimX, request.AimY);
    }
}