using Game.Core;
using Game.Core.Common.Math;
using Game.ServerLogic.Player.Requests;
using WsServer.Abstract.Messages;

namespace Game.ServerLogic.Player.Handlers;

public class UpdatePlayerStateRequestHandler(GameModel gameModel) : RequestHandlerBase<UpdatePlayerStateRequest>
{
    protected override void Handle(uint clientId, UpdatePlayerStateRequest request)
    {
        gameModel.SetPlayerControls(clientId, new Vector2D(request.AimX, request.AimY), request.ControlsState);
    }
}