using Game.Core;
using System.Numerics;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerStateRequestHandler(GameModel gameModel) : RequestHandlerBase<UpdatePlayerStateRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerStateRequest request)
    {
        // Reject NaN/Inf aim so it can't corrupt bullet direction / physics (audit §2).
        if (!float.IsFinite(request.AimX) || !float.IsFinite(request.AimY))
            return;

        gameModel.SetPlayerControls(clientId, new Vector2(request.AimX, request.AimY), request.ControlsState);
    }
}